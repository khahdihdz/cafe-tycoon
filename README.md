# ☕ Cafe Tycoon

Web game quản lý quán cà phê, chơi trực tiếp trên trình duyệt. Đồ họa 2.5D isometric vẽ hoàn toàn bằng Canvas 2D — không dùng sprite hay asset bên thứ ba.

Mỗi ngày kéo dài **90 giây** (tương ứng 08:00–22:00 trong game). Bạn pha chế, phục vụ khách, giữ danh tiếng, rồi tái đầu tư để mở rộng quán.

## Tính năng

- **Vòng lặp quản lý**: khách vào theo giờ cao điểm, gọi món, chờ đồ uống, trả tiền và rời quán. Hài lòng tăng danh tiếng, bỏ đi làm giảm danh tiếng.
- **Tương tác trực tiếp**: bấm vào khách đã có ly ☕ để phục vụ và nhận thêm tip.
- **6 món**: Espresso, Croissant, Latte, Cold Brew, Matcha Latte, Signature Cafe — mở khóa dần bằng tiền và danh tiếng.
- **Nâng cấp**: máy pha, số bàn, trang trí, quảng cáo (tổng 18 cấp).
- **Nhân viên**: nhân viên phục vụ tự động bưng ly, barista tăng tốc pha chế. Lương trừ vào cuối ngày.
- **Sự kiện ngẫu nhiên**: mưa rào, đoàn khách du lịch, máy pha kẹt, nguyên liệu giảm giá, khách VIP trả gấp 3.
- **Báo cáo cuối ngày**: doanh thu, tip, chi phí, lợi nhuận, khách phục vụ/mất, biến động danh tiếng, món bán chạy.
- **Lưu tự động** vào `localStorage`, có phiên bản save và kiểm tra dữ liệu khi tải.
- **Responsive**: chơi được bằng chuột hoặc cảm ứng, từ 360px; tôn trọng `prefers-reduced-motion`.
- **Không backend, không tài khoản, không theo dõi**.

## Cách chơi

1. Bấm **Mở quán**. Ngày đầu tiên bắt đầu với $120, 3 bàn và 2 món.
2. Khách đi vào và ngồi xuống. Máy pha xử lý từng ly một.
3. Khi khách có bong bóng ly cà phê, **bấm vào khách** để phục vụ — bạn nhận thêm tip.
4. Mua **nhân viên phục vụ** để quán tự bưng ly, hoặc **barista** để pha nhanh hơn.
5. Kết thúc ngày (hết giờ hoặc **Đóng cửa**), xem báo cáo rồi sang ngày mới.

Phím tắt: `Space` tạm dừng / chơi tiếp, `B` pha nhanh.

## Công nghệ

- [Vite](https://vite.dev/) + TypeScript (strict), không framework UI.
- Canvas 2D cho sân quán, animation và hiệu ứng hạt; DOM/CSS cho HUD và bảng điều khiển.
- Không dependency runtime. Font: Baloo 2 + Inter (Google Fonts, có fallback hệ thống).
- Toàn bộ đồ họa (tường, cửa sổ, bàn, máy pha, nhân vật, cây, đèn) được vẽ bằng code.

## Cấu trúc

```
cafe-tycoon/
├─ index.html
├─ src/
│  ├─ main.ts              # khởi động, vòng lặp, input
│  ├─ styles.css           # giao diện, responsive
│  ├─ core/
│  │  ├─ types.ts          # kiểu dữ liệu game
│  │  ├─ config.ts         # toàn bộ số liệu cân bằng (món, nâng cấp, sự kiện)
│  │  ├─ engine.ts         # mô phỏng thuần: tick, kinh tế, khách, sự kiện
│  │  ├─ save.ts           # lưu/tải localStorage + kiểm tra dữ liệu
│  │  └─ utils.ts          # định dạng tiền, giờ
│  ├─ render/
│  │  └─ scene.ts          # vẽ isometric, nhân vật, hạt, ánh sáng
│  └─ ui/
│     └─ ui.ts             # HUD, tabs, thẻ nâng cấp, modal báo cáo
├─ vite.config.ts
└─ package.json
```

Logic game tách khỏi DOM/canvas nên có thể mô phỏng nhiều ngày bằng Node để kiểm tra cân bằng.

## Chạy local

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # kiểm tra TypeScript + build vào dist/
npm run preview   # xem bản build tại http://localhost:4173
```

## Đưa lên GitHub

```bash
git init -b main
git add .
git commit -m "feat: cafe tycoon game"
git remote add origin https://github.com/<tài-khoản>/cafe-tycoon.git
git push -u origin main
```

## Deploy Cloudflare Pages bằng import repo

1. Đẩy mã nguồn lên GitHub (nhánh `main`).
2. Vào [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Chọn repo `cafe-tycoon` → **Begin setup**.
4. Điền cấu hình build:

   | Trường | Giá trị |
   | --- | --- |
   | Project name | `cafe-tycoon` |
   | Production branch | `main` |
   | Framework preset | `Vite` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `/` |
   | Environment variable | `NODE_VERSION` = `22` |

5. Bấm **Save and Deploy**. Lần build đầu mất khoảng 1–2 phút.
6. Mỗi lần push vào `main`, Cloudflare tự build và deploy lại. Mọi nhánh khác nhận preview URL riêng.

Ứng dụng là một trang tĩnh duy nhất, không cần biến môi trường bí mật, D1/KV/R2 hay Functions. Nếu project chưa có `404.html`, Cloudflare Pages tự trả `index.html` cho đường dẫn không tồn tại — phù hợp với game một trang.

### (Tuỳ chọn) Deploy bằng Wrangler

Nếu muốn dùng Cloudflare Workers + static assets thay vì Pages:

```bash
npx wrangler deploy --assets ./dist
```

hoặc thêm `wrangler.jsonc`:

```jsonc
{
  "name": "cafe-tycoon",
  "compatibility_date": "2026-01-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

rồi chạy `npx wrangler deploy`.

## Ghi chú kỹ thuật

- **Lưu game**: key `cafe-tycoon-save-v1`, gồm cả khách và hàng đợi pha nếu đang trong ca. Nếu `localStorage` bị chặn, game vẫn chạy nhưng không lưu.
- **Tạm dừng khi rời tab**: game tự tạm dừng và lưu khi chuyển tab/ẩn trình duyệt, tránh mất khách oan.
- **Cân bằng**: mọi con số nằm trong `src/core/config.ts` và `src/core/engine.ts`, không rải rác trong UI.
- **Hiệu năng**: vẽ ở device pixel ratio tối đa 2, cảnh tĩnh dùng hình khối đơn giản, hiệu ứng hạt có giới hạn.

## Giấy phép

MIT — xem [LICENSE](LICENSE).
