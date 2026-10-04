# Shinobi Clash — Huyết Chiến Thung Lũng

Game đối kháng ninja 3D chạy trên trình duyệt (Three.js + Vite), lấy cảm hứng từ dòng game
"arena fighter" kiểu Naruto Storm: di chuyển tự do 360°, combo, phi tiêu, thế thân, nhẫn thuật
và tuyệt kỹ có cắt cảnh điện ảnh. Toàn bộ nhân vật, môi trường, hiệu ứng và âm thanh đều
**tự sinh bằng code** — không dùng file asset nào, không vi phạm bản quyền.

## Chạy game

```bash
npm install
npm run dev
```

Mở http://localhost:5180 (nên dùng Chrome/Edge, bật tăng tốc phần cứng).
Build bản tĩnh: `npm run build` → thư mục `dist/`.

## Chế độ

- **Thử thách** — vượt 3 ải liên tiếp với 3 ninja còn lại, độ khó tăng dần (Dễ → Thường → Khó).
- **Đấu với máy** — 3 độ khó (Dễ / Thường / Khó), thắng 2/3 hiệp.
- **2 người chơi** — cùng bàn phím (P2 dùng phím mũi tên + Numpad) hoặc tay cầm.
- **Luyện tập** — bao cát đứng yên, chakra hồi nhanh, không giới hạn thời gian.
- Màn hình tiêu đề tự chạy trận AI vs AI làm nền.
- Hai chiêu phóng (cầu lửa, phi tiêu, cầu gió...) va vào nhau sẽ triệt tiêu — chiêu lớn hơn hẳn thì xuyên qua.

## Nhân vật

| Ninja | Hệ | Nhẫn thuật (30 chakra) | Tuyệt kỹ (100 chakra) |
|---|---|---|---|
| KAITO | Gió | Phong Cầu Xoáy — lao tới với quả cầu gió | Thiên Phong Đại Tuyền — phi tiêu gió khổng lồ, nghiền liên tục rồi nổ |
| REN | Lửa | Hỏa Cầu Thuật — phun cầu lửa | Hỏa Long Diệt Thế — rồng lửa truy đuổi |
| YUME | Sấm | Lôi Nha Đột — lưỡi sét xuyên thấu | Thiên Lôi Phán Xét — 6 tia sét giáng xuống |
| TETSU | Đất | Địa Thứ Liên Hoàn — hàng gai đá trồi lên | Sơn Băng Địa Liệt — thiên thạch đá rơi |

## Điều khiển

| Hành động | P1 | P2 | Tay cầm |
|---|---|---|---|
| Di chuyển | W A S D | Mũi tên | Cần trái |
| Nhảy | Space | Num 0 | A |
| Đánh (combo 4 đòn / cước bổ nhào trên không) | J | Num 1 | X |
| Phi tiêu | K | Num 2 | B |
| Nhẫn thuật | L | Num 3 | Y |
| Tuyệt kỹ | O | Num 6 | LT |
| Đỡ (giữ) | I | Num 5 | LB |
| Tụ chakra (giữ) | U | Num 4 | RT |
| Lướt / **Thế thân** khi trúng đòn | Shift | Num . / Num Enter | RB |

`Esc` tạm dừng · `H` bảng phím · `M` bật/tắt nhạc. Khi đấu với máy, P1 dùng được cả hai bộ phím.

## Cấu trúc code

```
src/
  main.js        vòng lặp game, luồng hiệp/trận, camera, hậu kỳ (bloom, grade, vignette)
  arena.js       đấu trường: bầu trời, mặt hồ phản chiếu, vách đá, thác nước, hoa anh đào, đèn đá
  rig.js         dựng nhân vật khớp xương từ primitive + mô phỏng khăn/tóc (verlet)
  poses.js       tư thế & keyframe các đòn đánh
  fighter.js     máy trạng thái chiến đấu, vật lý, nhận đòn, thế thân, animation
  jutsu.js       nhẫn thuật & tuyệt kỹ của từng hệ, đạn (projectile)
  effects.js     hạt (particles), vệt chém, tia sét, sóng xung kích, pool ánh sáng
  ai.js          AI đối thủ
  audio.js       âm thanh & nhạc nền tổng hợp bằng WebAudio
  input.js       bàn phím + gamepad
  ui.js          menu, chọn nhân vật, HUD
```

## Deploy (GitHub Pages)

Đã có sẵn workflow `.github/workflows/deploy.yml`: mỗi lần push lên `master`/`main`, GitHub Actions sẽ build và deploy.
Chỉ cần bật một lần: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Game sẽ có ở `https://<username>.github.io/shinobi-clash/`.
