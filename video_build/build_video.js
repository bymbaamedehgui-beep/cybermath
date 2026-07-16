// SUMMER CAMP промо MP4 угсрагч. ffmpeg-static ашиглана.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FF = path.resolve(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const FONT = 'arialbd.ttf'; // локал хуулсан (../node_modules биш, video_build дотор)
const W = 1080, H = 1920, FPS = 30, DUR = 4.0, DURF = Math.round(DUR * FPS);
const here = __dirname;

// Слайдууд: зураг + текст мөрүүд + фонтын хэмжээ
const slides = [
  { img: 'memory-2.jpg', size: 64, text: 'SUMMER CAMP\nАялангаа суралцъя\nMath Tour Mongolia' },
  { img: 'memory-1.jpg', size: 52, text: '2 дахь жилдээ\n10 хоногийн зуслан-аялал\nХамрах анги: 7–11' },
  { img: 'camp-cabins.jpg', size: 50, text: '7 ӨДӨР СУРГАЛТ\nАнгли хэл • Математик • AI\nДаам, шатар • Спорт' },
  { img: 'memory-4.jpg', size: 50, text: '3 ӨДӨР АЯЛАЛ\nЗоо парк • Аглаг хийд\nСайхны хөтөл • Тужийн нарс' },
  { img: 'camp-river.jpg', size: 52, text: 'Сөгнөгөр гол\nТөв аймаг, Батсүмбэр\nГол горхи, ой мод' },
  { img: 'camp-cabin.jpg', size: 50, text: '24 цагийн камер хяналт\n6 жил туршлагатай багш\nШинэ, цэвэр цэмцгэр орчин' },
  { img: 'memory-3.jpg', size: 52, text: 'I ээлж: 6/25 – 7/05\nII ээлж: 7/15 – 7/25\nҮнэ: 2,400,000₮' },
  { img: 'memory-5.jpg', size: 50, text: 'Утас: 8824 4252 / 8844 9307\nMath Tour Mongolia\nmath-tour-mongolia.vercel.app' },
];

const segs = [];

function run(args) {
  execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { cwd: here, stdio: 'inherit' });
}

// 1) Слайд бүрийг сегмент болгох
slides.forEach((s, i) => {
  const out = `seg${String(i).padStart(2, '0')}.mp4`;
  const lines = s.text.split('\n').map(l => l.replace(/'/g, '').replace(/:/g, '\\:'));
  const lineH = Math.round(s.size * 1.5);
  const panPad = 44;
  const panH = lines.length * lineH + panPad * 2;
  const panY = H - panH - 170;
  const y0 = panY + panPad;
  const draw = [
    `drawbox=x=0:y=${panY}:w=${W}:h=${panH}:color=black@0.45:t=fill`,
    ...lines.map((l, k) =>
      `drawtext=fontfile=${FONT}:text='${l}':fontcolor=white:fontsize=${s.size}:x=(w-text_w)/2:y=${y0 + k * lineH}`
    ),
  ];
  const vf = [
    `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`,
    `crop=${W * 2}:${H * 2}`,
    `zoompan=z='min(zoom+0.0009,1.18)':d=${DURF}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS}`,
    ...draw,
    `fade=t=in:st=0:d=0.5`,
    `fade=t=out:st=${DUR - 0.5}:d=0.5`,
    `setsar=1`,
  ].join(',') + '[v]';
  run([
    '-i', `../assets/${s.img}`,
    '-f', 'lavfi', '-t', String(DUR), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', vf,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-t', String(DUR),
    '-c:a', 'aac', '-b:a', '128k', '-shortest', out,
  ]);
  segs.push(out);
  console.log('slide', i, 'OK');
});

// 2) Бодит бичлэгүүдийг ижил формат руу хөрвүүлэх (босоо, дуутай)
['camp-video-1.mp4', 'camp-video-2.mp4'].forEach((clip, j) => {
  const out = `clip${j}.mp4`;
  const vf = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase`,
    `crop=${W}:${H}`,
    `fps=${FPS}`,
    `setsar=1`,
    `fade=t=in:st=0:d=0.4`,
  ].join(',') + '[v]';
  run([
    '-i', `../assets/${clip}`,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', vf,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-shortest', out,
  ]);
  segs.push(out);
  console.log('clip', j, 'OK');
});

// 3) Бүгдийг нэгтгэх (дахин кодлож цэвэр файл гаргах)
fs.writeFileSync(path.join(here, 'list.txt'), segs.map(s => `file '${s}'`).join('\n'), 'utf8');
run([
  '-f', 'concat', '-safe', '0', '-i', 'list.txt',
  '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
  '../assets/summer-camp-promo.mp4',
]);
console.log('DONE → assets/summer-camp-promo.mp4');
