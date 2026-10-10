# Shinobi Clash — Huyết Chiến Thung Lũng

Game đối kháng ninja 3D chạy trên trình duyệt (Three.js + Vite), phong cách **Naruto Storm**: di chuyển
tự do 360°, combo, phi tiêu, thế thân, 2 nhẫn thuật + tuyệt kỹ có cắt cảnh điện ảnh và **Khai Nhãn**
(biến hình khi máu thấp). Nhân vật được vẽ kiểu **anime cel-shading có viền mực**, có impact frame
đen-trắng khi trúng đòn mạnh và speed lines khi tung tuyệt kỹ. Toàn bộ nhân vật, môi trường, hiệu ứng
và âm thanh đều **tự sinh bằng code** — không dùng file asset nào. Bản fan-game cá nhân, không phát hành.

## Chạy game

```bash
npm install
npm run dev
```

Mở http://localhost:5180 (nên dùng Chrome/Edge, bật tăng tốc phần cứng).
Build bản tĩnh: `npm run build` → thư mục `dist/`.

## Chế độ

- **Thử thách** — vượt 5 ải liên tiếp với 5 ninja còn lại, độ khó tăng dần (Dễ → Thường → Khó).
- **Đấu với máy** — 3 độ khó (Dễ / Thường / Khó), thắng 2/3 hiệp.
- **2 người chơi** — cùng bàn phím (P2 dùng phím mũi tên + Numpad) hoặc tay cầm.
- **Luyện tập** — bao cát đứng yên, chakra hồi nhanh, không giới hạn thời gian.
- Màn hình tiêu đề tự chạy trận AI vs AI làm nền.
- Hai chiêu phóng (cầu lửa, phi tiêu, cầu gió...) va vào nhau sẽ triệt tiêu — chiêu lớn hơn hẳn thì xuyên qua.

## Nhân vật

| Ninja | Nhẫn thuật 1 (L) | Nhẫn thuật 2 (;) | Tuyệt kỹ (O) | Khai Nhãn (P) |
|---|---|---|---|---|
| NARUTO | Rasengan | Uzumaki Liên Đạn (2 phân thân) | Phong Độn: Rasenshuriken | Cửu Vĩ Chakra (4 đuôi) |
| SASUKE | Chidori | Phượng Tiên Hỏa (5 cầu lửa) | Kirin | Mangekyō · Susanoo |
| ITACHI | Hào Hỏa Cầu | Amaterasu (hắc viêm cháy dai) | Tsukuyomi (thế giới đỏ máu) | Susanoo |
| GAARA | Sa Thương Liên Hoàn | Sa Phược Cữu (quan tài cát) | Lưu Sa Bạo Lưu (sóng thần cát) | Nhất Vĩ Shukaku |
| MADARA | Hào Hỏa Diệt Khước (biển lửa) | Long Viêm Phóng Ca (rồng lửa) | Thiên Ngại Chấn Tinh (thiên thạch) | Rinnegan · Susanoo |
| ROCK LEE | Mộc Diệp Toàn Phong | Biểu Liên Hoa | Bát Môn: Triêu Khổng Tước | Bát Môn Độn Giáp |

Nhẫn thuật tốn 30 chakra, tuyệt kỹ 100 chakra. **Khai Nhãn** dùng được 1 lần mỗi hiệp khi máu dưới 45%:
hất văng đối thủ, 18 giây tăng 20% sát thương, 15% tốc độ, tự hồi chakra, +1 lần thế thân.

## Điều khiển

Xem cách ra combo chi tiết trong [COMBO.md](COMBO.md).

| Hành động | P1 | P2 | Tay cầm |
|---|---|---|---|
| Di chuyển | W A S D | Mũi tên | Cần trái |
| Nhảy | Space | Num 0 | A |
| Đánh (combo 4 đòn / cước bổ nhào trên không) | J | Num 1 | X |
| Phi tiêu | K | Num 2 | B |
| Nhẫn thuật 1 | L | Num 3 | Y |
| Nhẫn thuật 2 | ; | Num 9 | RT + Y / R3 |
| Tuyệt kỹ | O | Num 6 | LT |
| Khai Nhãn | P | Num 7 | L3 |
| Đỡ (giữ) | I | Num 5 | LB |
| Tụ chakra (giữ) | U | Num 4 | RT |
| Lướt / **Thế thân** khi trúng đòn | Shift | Num . / Num Enter | RB |

`Esc` tạm dừng · `H` bảng phím · `M` bật/tắt nhạc. Khi đấu với máy, P1 dùng được cả hai bộ phím.

## Cấu trúc code

```
src/
  main.js        vòng lặp game, luồng hiệp/trận, camera, hậu kỳ (bloom, impact frame, speed lines, Tsukuyomi)
  arena.js       đấu trường: bầu trời, mặt hồ phản chiếu, vách đá, thác nước, hoa anh đào, đèn đá
  rig.js         dựng nhân vật từ primitive, cel-shading + viền mực, trang phục, tóc (verlet)
  poses.js       tư thế & keyframe các đòn đánh
  fighter.js     máy trạng thái chiến đấu, vật lý, nhận đòn, thế thân, animation
  jutsu.js       thư viện nhẫn thuật & tuyệt kỹ (mỗi nhân vật chọn 3), đạn, chiêu tóm
  aura.js        Khai Nhãn: đuôi Cửu Vĩ, Susanoo, Shukaku, Bát Môn
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
