// ws_ppt — Дасгалын төвийн слайд тоглуулагч (api/wsppt.js, tools/ppt/ppt2hls.js хоёулаа энэ DDL-ийг ашиглана)
//   holds  = [[зогсох_сек, үргэлжлэх_сек, слайд], ...]  — товшилт бүрийн өмнөх ба слайдын төгсгөлийн зогсолт
//   starts = [слайд бүрийн эхлэх секунд]
//   m3u8   = AES-128 HLS плейлист (хэсгүүд нь Vercel Blob-ын бүтэн URL, түлхүүрийн URI = __KEY__)
//   key_hex — шифрийн түлхүүр, ЗӨВХӨН DB-д (API эрх шалгаад богино хугацааны токеноор өгнө)
exports.DDL = `CREATE TABLE IF NOT EXISTS ws_ppt (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  grade TEXT NOT NULL,
  topic TEXT,
  sort INT NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  slides INT NOT NULL,
  steps INT NOT NULL,
  duration REAL NOT NULL,
  holds JSONB NOT NULL,
  starts JSONB NOT NULL,
  m3u8 TEXT NOT NULL,
  key_hex TEXT NOT NULL,
  poster TEXT,
  blobs JSONB,
  preview_slides INT NOT NULL DEFAULT 2,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ws_ppt ADD COLUMN IF NOT EXISTS sg_id INT`;   // sg_id — Дасгалын төвийн дэд бүлэг (ws_subgroups.id): бүлгийн мөрөнд «Слайд» товч
