// ============================================================
// 商域之创世纪 · 试玩版客户端扩展（阶段 D）
// 挂载点：引擎预留的 custom_code.js（最后加载，可覆盖全局钩子）
// 功能：商品面板 / 打卡交互 / warp 传送（全部由地图 tags + 注入数据驱动）
// 不修改引擎任何既有 js/html 文件。
// ============================================================
(function () {
  'use strict';

  var DATA = null;          // syjt_data.json：全部地图锚点
  var MAPIDS = null;        // syjt_mapids.json：地图名 → 数据库 ID
  var currentMapName = null;
  var lastWarpAt = 0;
  var lastCheckinKey = null;
  var checkinsDone = {};    // checkin_id -> true

  // ---------- 工具 ----------
  function toast(text, color) {
    var t = document.getElementById('syjt_toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'syjt_toast';
      t.style.cssText = 'position:fixed;left:50%;top:80px;transform:translateX(-50%);' +
        'background:rgba(20,28,40,.92);color:#ffe08a;padding:10px 22px;border-radius:8px;' +
        'font:15px/1.4 sans-serif;z-index:99999;pointer-events:none;transition:opacity .3s;' +
        'box-shadow:0 4px 18px rgba(0,0,0,.4);';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.color = color || '#ffe08a';
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.opacity = '0'; }, 2200);
  }

  function closePanel() {
    var p = document.getElementById('syjt_panel');
    if (p) p.remove();
    var overlay = document.getElementById('syjt_overlay');
    if (overlay) overlay.remove();
  }

  function showProduct(prod) {
    closePanel();
    var overlay = document.createElement('div');
    overlay.id = 'syjt_overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99990;';
    overlay.onclick = closePanel;
    document.body.appendChild(overlay);

    var panel = document.createElement('div');
    panel.id = 'syjt_panel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:320px;background:#f7f4ec;border:2px solid #b9975b;border-radius:12px;' +
      'z-index:99991;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:sans-serif;';
    var img = prod.image_url
      ? '<img src="' + prod.image_url + '" alt="" style="width:96px;height:96px;' +
        'object-fit:contain;background:#fff;border:1px solid #ddd;border-radius:6px;float:left;' +
        'margin:0 14px 8px 0;">' : '';
    panel.innerHTML =
      '<div style="font-size:19px;font-weight:bold;color:#5c3a1e;margin-bottom:10px;">商品详情</div>' +
      '<div style="overflow:hidden;">' + img +
        '<div style="font-size:17px;font-weight:bold;color:#222;">' + (prod.product_name || '') + '</div>' +
        '<div style="font-size:20px;color:#c0392b;font-weight:bold;margin-top:6px;">' + (prod.price || '') + '</div>' +
      '</div>' +
      '<div style="clear:both;font-size:13px;color:#555;margin:10px 0 16px;line-height:1.6;">' +
        (prod.desc || '') + '</div>' +
      '<button id="syjt_close" style="width:100%;padding:8px;background:#8b6b3d;color:#fff;' +
        'border:0;border-radius:6px;font-size:14px;cursor:pointer;">关闭</button>';
    document.body.appendChild(panel);
    document.getElementById('syjt_close').onclick = closePanel;
  }

  function currentMapData() {
    if (!DATA || !currentMapName) return null;
    return DATA.maps[currentMapName] || null;
  }

  function resolveMapId(mapName) {
    if (MAPIDS && MAPIDS[mapName]) return MAPIDS[mapName];
    var names = DATA ? Object.keys(DATA.maps) : [];
    var i = names.indexOf(mapName);
    return i >= 0 ? i + 1 : null;
  }

  function doWarp(w) {
    var now = Date.now();
    if (now - lastWarpAt < 1800) return;
    var targetId = resolveMapId(w.target_map);
    if (!targetId) { toast('目标地图未配置: ' + w.target_map, '#ff8a8a'); return; }
    var target = DATA && DATA.maps[w.target_map];
    var mark = target && target.marks && target.marks[w.target_mark];
    var to = mark ? [mark.x, mark.y] : (target && target.spawn) || [5, 5];
    lastWarpAt = now;
    toast('正在进入 ' + ((target && target.label) || w.target_map) + ' …', '#9be29b');
    try {
      SendCmd('MOV', { 'new_map': targetId, 'to': to });
    } catch (e) {
      console.error('[syjt] warp failed', e);
    }
  }

  function checkPosition(x, y) {
    var d = currentMapData();
    if (!d) return;
    var i, c, w;

    for (i = 0; i < (d.checkins || []).length; i++) {
      c = d.checkins[i];
      if (c.x === x && c.y === y) {
        var key = currentMapName + ':' + c.checkin_id;
        if (key !== lastCheckinKey) {
          lastCheckinKey = key;
          checkinsDone[c.checkin_id] = true;
          var n = Object.keys(checkinsDone).length;
          toast((c.message || '打卡成功') + '（已打卡 ' + n + ' 处）', '#8fd3ff');
        }
      }
    }

    for (i = 0; i < (d.warps || []).length; i++) {
      w = d.warps[i];
      if (w.x === x && w.y === y && w.trigger === 'on_enter') {
        doWarp(w);
        break;
      }
    }
  }

  // ---------- 覆盖引擎钩子：拦截所有服务端消息 ----------
  var originalFilter = (typeof customReceiveMessageFilter === 'function')
    ? customReceiveMessageFilter : null;

  window.customReceiveMessageFilter = function (cmd, arg) {
    try {
      if (cmd === 'MAI' && arg) {
        if (arg.tags && arg.tags.syjt && arg.tags.syjt.map_name) {
          currentMapName = arg.tags.syjt.map_name;
        } else {
          for (var name in MAPIDS) {
            if (MAPIDS[name] === arg.id) { currentMapName = name; break; }
          }
        }
        lastCheckinKey = null;
      } else if (cmd === 'MOV' && arg && arg.id === PlayerYou && Array.isArray(arg.to)) {
        checkPosition(arg.to[0], arg.to[1]);
      }
    } catch (e) {
      console.error('[syjt] filter error', e);
    }
    return originalFilter ? originalFilter(cmd, arg) : true;
  };

  // ---------- 点击商品锚点打开面板（捕获阶段，不干扰移动） ----------
  function bindClick() {
    if (typeof mapCanvas === 'undefined' || !mapCanvas) return;
    mapCanvas.addEventListener('mousedown', function (evt) {
      if (evt.button !== 0) return;
      var d = currentMapData();
      if (!d || !d.products || !d.products.length) return;
      var pos;
      try { pos = getTilePos(evt); } catch (e) { return; }
      for (var i = 0; i < d.products.length; i++) {
        var p = d.products[i];
        if (p.x === pos.x && p.y === pos.y) {
          showProduct(p);
          return;
        }
      }
    }, true);
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel();
  });

  // ---------- 初始化：加载注入数据 ----------
  function loadJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' -> ' + r.status);
      return r.json();
    });
  }

  function init() {
    Promise.all([loadJSON('js/syjt_data.json'), loadJSON('js/syjt_mapids.json')])
      .then(function (res) {
        DATA = res[0];
        MAPIDS = res[1];
        bindClick();
        console.log('[syjt] 商域之创世纪扩展已加载，地图数=', Object.keys(DATA.maps).length);
      })
      .catch(function (e) {
        console.error('[syjt] 数据加载失败', e);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
