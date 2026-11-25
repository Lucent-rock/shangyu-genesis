#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render 启动适配层（不修改 TilemapTown 引擎核心）。

用法（在 pyserver 目录下）：
    python run_render.py config.render.json

Render 会注入 PORT 环境变量；引擎默认读 Server.Port=12550，
本脚本在导入 server 之前覆盖配置，使 WebSocket 监听 Render 指定端口。
可选的 SYJT_ALLOWED_ORIGINS 用于临时覆盖配置里的 Origin 白名单（逗号分隔）。
"""
import os
import sys

from tilemaptown_server import buildglobal as G


def parse_origins(raw):
    return [item.strip() for item in raw.split(",") if item.strip()]


port = os.environ.get("PORT")
if port:
    try:
        G.Config["Server"]["Port"] = int(port)
    except ValueError:
        raise SystemExit("[run_render] Invalid PORT value: %r" % port)

origins = os.environ.get("SYJT_ALLOWED_ORIGINS")
if origins:
    allowed = parse_origins(origins)
    G.Config["Security"]["AllowedOrigins"] = allowed
    G.Config["Security"]["AllowedOrigins2"] = allowed

print("[run_render] config=%s port=%s db=%s imgbase=%s origins=%s" % (
    G.ConfigFile,
    G.Config["Server"]["Port"],
    G.Config["Database"]["File"],
    G.Config["Server"].get("ResourceIMGBase", ""),
    G.Config["Security"].get("AllowedOrigins"),
), flush=True)

# server 模块导入时会读 G.Config 并初始化数据库，因此必须放在覆盖之后
from tilemaptown_server import server  # noqa: E402

server.main()
