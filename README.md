# اسپلیتو — Persian Bill Splitter

یک اپ React/Vite موبایل‌فرندلی برای تقسیم هزینه گروهی با طراحی Soft Glass.

## قابلیت‌ها
- تقسیم مساوی، بر اساس آیتم، و سفارشی
- مالیات، انعام، هزینه سرویس و گرد کردن مبالغ
- ریال، دلار و یورو
- انتخاب پرداخت‌کننده و محاسبه کمینه «چه کسی به چه کسی پرداخت کند»
- OCR رسید با Tesseract.js (فارسی + انگلیسی)
- QR و لینک قابل اشتراک؛ لینک شامل snapshot محاسبه است
- Web Share API و اشتراک تلگرام
- خروجی PNG از کارت اشتراک
- وضعیت پرداخت و درصد پیشرفت تسویه
- واکنش‌ها و یادآوری پرداخت
- ذخیره محلی و تاریخچه با localStorage
- Mobile-first / RTL / مناسب Vercel

## اجرا
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Deploy روی Vercel
1. فولدر را در GitHub قرار بده یا مستقیماً در Vercel Import کن.
2. Framework Preset: Vite
3. Build Command: `npm run build`
4. Output Directory: `dist`

`vercel.json` برای SPA rewrite آماده است.

## نکته OCR
مدل زبانی Tesseract هنگام اولین OCR ممکن است فایل‌های language-data را از اینترنت بارگذاری کند. اگر OCR در مرورگر یا شبکه خاصی محدود باشد، خود عکس رسید همچنان ذخیره می‌شود و ورود دستی آیتم‌ها فعال است.
