#!/usr/bin/env python3
"""Gera os ícones PNG do app (oval inclinado + stock car 48) sem dependências."""
import zlib, struct, math

def png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(px[y*w*3:(y+1)*w*3]) for y in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
                           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def make(S, path):
    px = bytearray(S * S * 3)
    cx, cy = S / 2, S * 0.52
    for y in range(S):
        for x in range(S):
            t = y / S
            r, g, b = int(20 + 30 * (1 - t)), int(28 + 40 * (1 - t)), int(50 + 60 * (1 - t))
            # oval (elipse em perspectiva)
            dx, dy = (x - cx) / (S * 0.40), (y - cy) / (S * 0.24)
            q = math.hypot(dx, dy)
            if 0.72 < q < 1.0:
                sh = int(70 + 60 * (q - 0.72) / 0.28)
                r, g, b = sh, sh, sh + 4
                if 0.955 < q < 0.99: r, g, b = 235, 235, 235      # muro
                if 0.74 < q < 0.76: r, g, b = 240, 200, 30        # faixa amarela
            elif q <= 0.72:
                r, g, b = 70, 120, 60
            # carro vermelho na reta da frente
            if abs(x - S * 0.5) < S * 0.13 and abs(y - (cy + S * 0.205)) < S * 0.045:
                r, g, b = 215, 38, 30
                if abs(x - S * 0.5) < S * 0.035 and abs(y - (cy + S * 0.205)) < S * 0.03: r, g, b = 255, 255, 255
            i = (y * S + x) * 3
            px[i:i + 3] = bytes((r, g, b))
    png(path, S, S, px)

make(192, 'icons/icon-192.png')
make(512, 'icons/icon-512.png')
make(180, 'icons/apple-touch-icon.png')
