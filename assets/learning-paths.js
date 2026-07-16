/**
 * CyberMath Learning Paths — 6-12 ангийн хичээлийн зам
 *
 * Хэрэглэх:
 *   var out = CyberMathPaths.renderPath(6);
 *   document.getElementById('path-container').innerHTML = out.svg;
 *   window.lessons = out.lessons;
 *
 * Curriculum data-г засах бол доорх CURRICULA объектыг өөрчил.
 * SVG-г generateSvg() автоматаар үүсгэнэ — гараар SVG засах шаардлагагүй.
 */
(function (global) {
  'use strict';

  // ===== Section colors (topic төрлөөр) =====
  var TOPIC_COLORS = {
    number:   '#58CC02', // ногоон — Тоо, үйлдэл
    algebra:  '#58CC02', // ногоон — Алгебр
    geometry: '#1CB0F6', // цэнхэр — Геометр
    trig:     '#1CB0F6', // цэнхэр — Тригонометр
    stat:     '#FFC800', // шар   — Статистик
    prob:     '#CE82FF', // ягаан — Магадлал, комбинаторик
    calc:     '#FF9600', // улбар — Хязгаар, дифференциал, интеграл
    other:    '#58CC02',
  };

  // ============================================================
  //  CURRICULA — Ангиудын бүлэг ба хичээлийн нэр
  // ============================================================
  // Схем:
  //   { title: 'Бүлгийн нэр', topic: 'algebra', lessons: [ 'Хичээлийн нэр', ... ] }
  //   Хичээл бүрд автоматаар 10 бодлого placeholder үүснэ.
  //   5 хичээл тутам "Бататгал" node оруулна.
  // ============================================================
  var CURRICULA = {

    // ============ 6-р анги ============
    6: [
      { title: 'Натурал тоо ба үйлдлүүд', topic: 'number', lessons: [
        'Натурал тооны бичлэг, орон, ангилал',
        'Нэмэх, хасах үйлдэл',
        'Үржих, хуваах үйлдэл',
        'Үйлдлийн дараалал, хаалт',
      ] },
      { title: 'Хуваагдал ба олон тоот', topic: 'number', lessons: [
        'Хуваагдах шинж',
        'Энгийн ба нийлмэл тоо',
        'Хамгийн бага ерөнхий үржвэр',
        'Хамгийн их ерөнхий хуваагч',
      ] },
      { title: 'Энгийн бутархай', topic: 'number', lessons: [
        'Бутархайн тухай ойлголт',
        'Бутархайг товчлох, тэнцүү бутархай',
        'Бутархай нэмэх, хасах',
        'Бутархай үржих, хуваах',
        'Холимог тоо',
      ] },
      { title: 'Аравтын бутархай', topic: 'number', lessons: [
        'Аравтын бутархайн ойлголт',
        'Аравтын бутархайг харьцуулах',
        'Аравтын бутархай нэмэх, хасах',
        'Аравтын бутархай үржих, хуваах',
      ] },
      { title: 'Хувь ба харьцаа', topic: 'number', lessons: [
        'Хувь, хувийн бодлого',
        'Харьцаа, пропорц',
        'Шууд ба урвуу пропорц',
      ] },
      { title: 'Геометрийн үндэс', topic: 'geometry', lessons: [
        'Цэг, шулуун, хэрчим',
        'Өнцөг, өнцгийн төрлүүд',
        'Гурвалжин, төрлүүд',
        'Дөрвөн өнцөгт',
        'Тойрог, диаметр, радиус',
      ] },
      { title: 'Талбай ба эзэлхүүн', topic: 'geometry', lessons: [
        'Талбайн ойлголт, дөрвөлжин',
        'Тэгш өнцөгтийн талбай',
        'Гурвалжны талбай',
        'Куб, тэгш өнцөгт параллелепипед',
      ] },
      { title: 'Статистикийн эхлэл', topic: 'stat', lessons: [
        'Мэдээлэл цуглуулах',
        'Хүснэгт, диаграмм',
        'Дундаж утга',
      ] },
    ],

    // ============ 7-р анги ============
    7: [
      { title: 'Бүхэл ба рационал тоо', topic: 'number', lessons: [
        'Эерэг сөрөг тоо',
        'Абсолют утга',
        'Бүхэл тооны үйлдлүүд',
        'Рационал тооны үйлдлүүд',
      ] },
      { title: 'Илэрхийлэл ба тэгшитгэл', topic: 'algebra', lessons: [
        'Үсэгт илэрхийлэл, ижил гишүүн',
        'Илэрхийлэл товчлох',
        'Шугаман тэгшитгэл',
        'Тэгшитгэлийн бодлого',
        'Тэнцэтгэл бус',
      ] },
      { title: 'Функцийн эхлэл', topic: 'algebra', lessons: [
        'Хос тоог координатад буулгах',
        'Шугаман хамаарал y = kx',
        'y = kx + b функц',
      ] },
      { title: 'Пропорц ба хувь', topic: 'number', lessons: [
        'Шууд пропорц',
        'Урвуу пропорц',
        'Хувийн бодлого',
      ] },
      { title: 'Гурвалжны шинж чанар', topic: 'geometry', lessons: [
        'Гурвалжны өнцгүүдийн нийлбэр',
        'Ижил хажуут гурвалжин',
        'Гурвалжны тэнцүү байх шинж',
        'Гадна өнцөг',
      ] },
      { title: 'Дөрвөн өнцөгт', topic: 'geometry', lessons: [
        'Параллелограмм',
        'Ромб, тэгш өнцөгт',
        'Трапец',
        'Дөрвөн өнцөгтийн талбай',
      ] },
      { title: 'Тойрог', topic: 'geometry', lessons: [
        'Тойргийн шүргэгч',
        'Төв өнцөг, багтаасан өнцөг',
        'Тойргийн урт, талбай',
      ] },
      { title: 'Статистик ба магадлалын үндэс', topic: 'stat', lessons: [
        'Мэдээлэл цуглуулах, боловсруулах',
        'Дундаж, медиан, мод',
        'Магадлалын эхлэл',
      ] },
    ],

    // ============ 8-р анги ============
    8: [
      { title: 'Олон гишүүнт', topic: 'algebra', lessons: [
        'Нэг гишүүнт, олон гишүүнт',
        'Олон гишүүнт нэмэх, хасах',
        'Олон гишүүнт үржих',
        'Товчилсон үржвэрийн томьёо',
        'Куб дөрвөлжин, хоёр гурвалжны ялгавар',
      ] },
      { title: 'Ялгарлыг үржвэрт задлах', topic: 'algebra', lessons: [
        'Хамтын үржигдэхүүн гаргах',
        'Бүлэглэх арга',
        'Товчилсон үржвэрийн томьёогоор',
        'Холимог арга',
      ] },
      { title: 'Алгебрийн бутархай', topic: 'algebra', lessons: [
        'Алгебрийн бутархайн товчлол',
        'Нэмэх, хасах',
        'Үржих, хуваах',
      ] },
      { title: 'Квадрат язгуур', topic: 'algebra', lessons: [
        'Квадрат язгуурын ойлголт',
        'Язгуурын шинж чанар',
        'Язгуурт үйлдэл',
      ] },
      { title: 'Пифагорын теорем', topic: 'geometry', lessons: [
        'Пифагорын теорем',
        'Уриа теорем',
        'Пифагорын теоремын хэрэглээ',
      ] },
      { title: 'Тэгш талт олон өнцөгт', topic: 'geometry', lessons: [
        'Олон өнцөгтийн өнцгийн нийлбэр',
        'Тэгш талт олон өнцөгт',
        'Олон өнцөгтийн талбай',
      ] },
      { title: 'Тойргийн шинж чанар', topic: 'geometry', lessons: [
        'Тойрог ба шулуун',
        'Багтаасан ба тэгш нүүр өнцөг',
        'Тойргийн секторын талбай',
      ] },
      { title: 'Функц', topic: 'algebra', lessons: [
        'Функцийн ойлголт, тэмдэглэгээ',
        'Шугаман функц y = kx + b',
        'Функцийн график',
      ] },
      { title: 'Статистик', topic: 'stat', lessons: [
        'Тархалтын хүснэгт',
        'Диаграмм, гистограмм',
        'Дундаж, стандарт хазайлт',
      ] },
    ],

    // ============ 9-р анги (одоо байгаа – реф зорилгоор) ============
    // 9-р ангийн бодит агуулгыг index.html-ээс уншина (энэ модуль ашиглагдахгүй).
    9: null,

    // ============ 10-р анги ============
    10: [
      { title: 'Тооны олонлог', topic: 'number', lessons: [
        'Натурал, бүхэл, рационал тоо',
        'Иррационал, бодит тоо',
        'Тооны олонлогийн үйлдэл',
      ] },
      { title: 'Функц ба тэгшитгэл', topic: 'algebra', lessons: [
        'Функцийн тодорхойлолт',
        'Функцийн шинж чанар (тэгш/сондгой, монотон)',
        'Функцийн урвуу',
        'Нийлмэл функц',
      ] },
      { title: 'Тригонометрийн үндэс', topic: 'trig', lessons: [
        'Радиан хэмжигдэхүүн',
        'Тригонометрийн үндсэн харьцаа',
        'sin, cos, tan график',
        'Тригонометрийн адилтгал',
        'Тригонометрийн тэгшитгэл',
      ] },
      { title: 'Логарифм', topic: 'algebra', lessons: [
        'Зэрэг, зэргийн шинж',
        'Логарифмын ойлголт',
        'Логарифмын шинж чанар',
        'Логарифм илэрхийлэл',
        'Логарифм тэгшитгэл',
      ] },
      { title: 'Хязгаар', topic: 'calc', lessons: [
        'Дараалал, хязгаарын ойлголт',
        'Функцийн хязгаар',
        'Хязгаарын үйлдэл',
      ] },
      { title: 'Матриц', topic: 'algebra', lessons: [
        'Матрицын тодорхойлолт',
        'Матрицын үйлдлүүд',
        'Детерминант',
      ] },
      { title: 'Шугаман тэгшитгэлийн систем', topic: 'algebra', lessons: [
        'Гауссын арга',
        'Крамерын дүрэм',
        'Матрицаар бодох',
      ] },
      { title: 'Стереометрийн үндэс', topic: 'geometry', lessons: [
        'Огторгуйн шулуун, хавтгай',
        'Параллель, перпендикуляр',
        'Хос орон зайн өнцөг',
      ] },
      { title: 'Магадлалын үндэс', topic: 'prob', lessons: [
        'Санамсаргүй үзэгдэл',
        'Магадлалын сонгодог тодорхойлолт',
        'Хамааралтай, хамааралгүй үзэгдэл',
      ] },
    ],

    // ============ 11-р анги ============
    11: [
      { title: 'Үүсмэл (Дифференциал)', topic: 'calc', lessons: [
        'Үүсмэлийн тодорхойлолт',
        'Үндсэн функцүүдийн үүсмэл',
        'Үржвэр, харьцаа, нийлмэл функцийн үүсмэл',
        'Үүсмэлийн геометр утга',
        'Үүсмэлийн хэрэглээ — экстремум',
        'Үүсмэлийн хэрэглээ — график судлах',
      ] },
      { title: 'Интегралын үндэс', topic: 'calc', lessons: [
        'Тодорхойгүй интеграл',
        'Үндсэн интегралын хүснэгт',
        'Интегралчлалын аргууд — орлуулга',
        'Хэсэгчилсэн интегралчлал',
        'Тодорхой интеграл',
      ] },
      { title: 'Комплекс тоо', topic: 'algebra', lessons: [
        'Комплекс тооны ойлголт',
        'Комплекс тоог алгебр хэлбэрт бичих',
        'Модуль, аргумент',
        'Комплекс тооны үйлдэл',
        'Тригонометр хэлбэр, Муаврын томьёо',
      ] },
      { title: 'Вектор', topic: 'geometry', lessons: [
        'Вектор, векторын үйлдэл',
        'Координатан систем дэх вектор',
        'Скаляр үржвэр',
        'Вектор үржвэр',
        'Векторын хэрэглээ',
      ] },
      { title: 'Стереометр', topic: 'geometry', lessons: [
        'Призм, пирамид',
        'Цилиндр, конус, бөмбөрцөг',
        'Гадаргуугийн талбай',
        'Эзэлхүүн',
      ] },
      { title: 'Комбинаторик', topic: 'prob', lessons: [
        'Тооллын үндсэн зарчим',
        'Сэлгэмэл',
        'Ба зохион байгуулалт',
        'Хослол',
        'Ньютоны бином',
      ] },
      { title: 'Магадлал (гүнзгий)', topic: 'prob', lessons: [
        'Магадлалын нэмэх, үржих теорем',
        'Нөхцөлт магадлал',
        'Бүрэн магадлалын томьёо',
        'Бернулли туршилт',
      ] },
    ],

    // ============ 12-р анги ============
    12: [
      { title: 'Үүсмэлийн гүнзгий хэрэглээ', topic: 'calc', lessons: [
        'Үүсмэлийн хэрэглээ — max/min',
        'Функцийн монотон, экстремум',
        'Хотгор, гүдгэр, тэгшитгэлийн цэг',
        'Функцийн график бүрэн судлах',
        'Хэрэглээний бодлого — оптимизаци',
      ] },
      { title: 'Тодорхой интеграл', topic: 'calc', lessons: [
        'Ньютон-Лейбницын томьёо',
        'Талбай олох',
        'Эзэлхүүн олох',
        'Хэрэглээний бодлого',
      ] },
      { title: 'Дифференциал тэгшитгэл', topic: 'calc', lessons: [
        'Дифференциал тэгшитгэлийн ойлголт',
        'Салбарлах хувьсагчтай',
        'Нэгдүгээр эрэмбийн шугаман',
        'Хэрэглээ — өсөлт, суналт',
      ] },
      { title: 'Тригонометрийн тэгшитгэл', topic: 'trig', lessons: [
        'Энгийн тригонометрийн тэгшитгэл',
        'Нэгэн төрөл тэгшитгэл',
        'Хосолсон тэгшитгэл',
        'Тэнцэтгэл бус',
      ] },
      { title: 'Илтгэгч, логарифм тэгшитгэл', topic: 'algebra', lessons: [
        'Илтгэгч тэгшитгэл',
        'Логарифм тэгшитгэл',
        'Тэнцэтгэл бус',
      ] },
      { title: 'Стереометр (гүнзгий)', topic: 'geometry', lessons: [
        'Хавтгай ба огторгуйн өнцөг',
        'Цилиндр, конус, бөмбөрцгийн шинж',
        'Огторгуйд заасан эзэлхүүн',
        'Огторгуйн координатан систем',
      ] },
      { title: 'Магадлал ба статистик', topic: 'prob', lessons: [
        'Дискрет санамсаргүй хэмжигдэхүүн',
        'Магадлалын нягтын функц',
        'Хүлээгдэж буй утга, дисперс',
        'Нормаль тархалт',
      ] },
      { title: 'Тооны онол ба комбинаторик', topic: 'prob', lessons: [
        'Хуваагдал, модуль',
        'Диофантын тэгшитгэл',
        'Тооллын сэдвүүд',
        'Ньютоны биномийн хэрэглээ',
      ] },
    ],
  };

  // ============================================================
  //  SVG GENERATOR
  // ============================================================
  var NODE_X_PATTERN = [210, 320, 100, 305, 115, 295, 125]; // zigzag
  var NODE_Y_STEP = 115;
  var SECTION_GAP = 125;         // хоёр бүлгийн зайд нэмэгдэх зай
  var EXAM_EVERY = 5;            // 5 хичээл тутам бататгал node
  var CANVAS_W = 420;
  var TOP_PAD = 173;

  function nodeX(idx) {
    return NODE_X_PATTERN[idx % NODE_X_PATTERN.length];
  }

  /**
   * Curriculum-аас node массив байгуулна.
   * Node = { id, cx, cy, type, sectionIdx, title, isExam }
   */
  function layoutNodes(curriculum) {
    var nodes = [];
    var sectionLabels = [];
    var y = TOP_PAD;
    var nodeIdx = 0;
    var lessonCounter = 0;
    var idCounter = 1;

    curriculum.forEach(function (section, sIdx) {
      // Section label (эхнийхийг тавихгүй — cover-т байна)
      if (sIdx > 0) {
        sectionLabels.push({
          y: y - Math.floor(SECTION_GAP / 2),
          text: section.title,
          color: TOPIC_COLORS[section.topic] || TOPIC_COLORS.other,
        });
      } else {
        // Эхний бүлэг тэмдэглэгээ (top-д)
        sectionLabels.push({
          y: y - 60,
          text: section.title,
          color: TOPIC_COLORS[section.topic] || TOPIC_COLORS.other,
        });
      }

      section.lessons.forEach(function (lessonTitle, li) {
        nodes.push({
          id: idCounter++,
          cx: nodeX(nodeIdx),
          cy: y,
          type: 'lesson',
          sectionIdx: sIdx,
          title: lessonTitle,
          topic: section.topic,
        });
        nodeIdx++;
        y += NODE_Y_STEP;
        lessonCounter++;

        // 5 хичээл тутам "Бататгал" оруулах — зөвхөн section-ий дунд
        if (lessonCounter % EXAM_EVERY === 0 && li < section.lessons.length - 1) {
          nodes.push({
            id: idCounter++,
            cx: nodeX(nodeIdx),
            cy: y,
            type: 'exam',
            sectionIdx: sIdx,
            title: 'Бататгал',
            topic: section.topic,
          });
          nodeIdx++;
          y += NODE_Y_STEP;
        }
      });

      // Section төгсгөлд бататгал
      nodes.push({
        id: idCounter++,
        cx: nodeX(nodeIdx),
        cy: y,
        type: 'exam',
        sectionIdx: sIdx,
        title: section.title + ' — бататгал',
        topic: section.topic,
      });
      nodeIdx++;
      y += NODE_Y_STEP + SECTION_GAP;
    });

    var totalHeight = y + 100;
    return { nodes: nodes, sectionLabels: sectionLabels, height: totalHeight };
  }

  function svgNodesXml(nodes) {
    return nodes.map(function (n) {
      var r = n.type === 'exam' ? 35 : 30;
      var glowColor = n.type === 'exam' ? '#FFC800' : (TOPIC_COLORS[n.topic] || '#58CC02');
      var out = '';
      // outer glow
      out += '<circle cx="' + n.cx + '" cy="' + n.cy + '" r="' + (r + 8) + '" fill="' + glowColor + '" opacity="0.15"/>';
      // dark inner
      out += '<circle cx="' + n.cx + '" cy="' + n.cy + '" r="' + r + '" fill="#1a1035" stroke="' + glowColor + '" stroke-width="3"/>';
      // icon text
      var icon = n.type === 'exam' ? '★' : (n.id);
      out += '<text x="' + n.cx + '" y="' + (n.cy + 6) + '" text-anchor="middle" font-size="' + (n.type === 'exam' ? 20 : 14) + '" fill="' + glowColor + '" font-weight="900" font-family="sans-serif">' + icon + '</text>';
      // clickable hit-target
      out += '<circle cx="' + n.cx + '" cy="' + n.cy + '" r="' + r + '" fill="transparent" style="cursor:pointer" onclick="tryOpenLesson(' + n.id + ')"/>';
      // title below
      out += '<text x="' + n.cx + '" y="' + (n.cy + r + 20) + '" text-anchor="middle" font-size="10" fill="#a89cd6" font-weight="600" font-family="sans-serif">' + escapeXml(truncate(n.title, 18)) + '</text>';
      return out;
    }).join('\n');
  }

  function svgPathsXml(nodes) {
    var out = [];
    for (var i = 0; i < nodes.length - 1; i++) {
      var a = nodes[i], b = nodes[i + 1];
      // curved cubic bezier
      var midY1 = a.cy + (b.cy - a.cy) * 0.35;
      var midY2 = a.cy + (b.cy - a.cy) * 0.65;
      var midX = (a.cx + b.cx) / 2;
      var d = 'M' + a.cx + ',' + a.cy + ' C' + midX + ',' + midY1 + ' ' + midX + ',' + midY2 + ' ' + b.cx + ',' + b.cy;
      out.push('<path d="' + d + '" fill="none" stroke="#050805" stroke-width="6" stroke-linecap="round" stroke-dasharray="11 7"/>');
      out.push('<path d="' + d + '" id="path-' + a.id + '-' + b.id + '" fill="none" stroke="rgba(100,180,255,0.25)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="10 8"/>');
    }
    return out.join('\n');
  }

  function svgSectionLabelsXml(sectionLabels) {
    return sectionLabels.map(function (s, i) {
      return '<line x1="30" y1="' + s.y + '" x2="155" y2="' + s.y + '" stroke="' + s.color + '" stroke-width="1" opacity="0.4"/>' +
        '<text id="section-label-' + i + '" x="210" y="' + (s.y + 4) + '" font-size="13" fill="' + s.color + '" text-anchor="middle" font-weight="700" font-family="sans-serif" opacity="0.9">' + escapeXml(s.text) + '</text>' +
        '<line x1="265" y1="' + s.y + '" x2="390" y2="' + s.y + '" stroke="' + s.color + '" stroke-width="1" opacity="0.4"/>';
    }).join('\n');
  }

  function generateSvg(grade) {
    var curriculum = CURRICULA[grade];
    if (!curriculum) return { svg: '', lessons: {}, error: 'Grade ' + grade + ' not found' };

    var layout = layoutNodes(curriculum);
    var svg = '<svg id="path-svg" viewBox="0 0 ' + CANVAS_W + ' ' + layout.height + '" ' +
      'width="100%" xmlns="http://www.w3.org/2000/svg" style="background:#0d0b1a">';
    svg += svgSectionLabelsXml(layout.sectionLabels);
    svg += svgPathsXml(layout.nodes);
    svg += svgNodesXml(layout.nodes);
    svg += '</svg>';

    // lessons объект байгуулах
    var lessons = {};
    layout.nodes.forEach(function (n) {
      if (n.type === 'exam') {
        lessons[n.id] = {
          title: n.title,
          questions: generateExamQuestions(n.title),
        };
      } else {
        lessons[n.id] = {
          title: n.title,
          questions: generatePlaceholderQuestions(n.title, curriculum[n.sectionIdx].title),
        };
      }
    });

    return {
      svg: svg,
      lessons: lessons,
      nodes: layout.nodes,
      sectionLabels: layout.sectionLabels,
      height: layout.height,
      grade: grade,
    };
  }

  // ============================================================
  //  Helpers
  // ============================================================
  function generatePlaceholderQuestions(lessonTitle, sectionTitle) {
    var out = [];
    for (var i = 1; i <= 10; i++) {
      out.push({
        q: lessonTitle + ' — ' + i + '-р бодлого',
        hint: { text: sectionTitle + ' нэгжийн агуулга' },
        options: ['A', 'B', 'C', 'D'],
        correct: (i - 1) % 4,
      });
    }
    return out;
  }

  function generateExamQuestions(title) {
    var out = [];
    for (var i = 1; i <= 10; i++) {
      out.push({
        q: title + ' — ' + i + '-р шалгах',
        hint: { text: 'Бататгал шалгалт' },
        options: ['A', 'B', 'C', 'D'],
        correct: (i - 1) % 4,
      });
    }
    return out;
  }

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncate(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // ============================================================
  //  Publicly exposed API
  // ============================================================
  global.CyberMathPaths = {
    CURRICULA: CURRICULA,
    TOPIC_COLORS: TOPIC_COLORS,
    renderPath: generateSvg,
    listGrades: function () {
      return Object.keys(CURRICULA).filter(function (k) { return CURRICULA[k]; }).map(Number);
    },
    countLessons: function (grade) {
      var c = CURRICULA[grade];
      if (!c) return 0;
      return c.reduce(function (acc, sec) { return acc + sec.lessons.length; }, 0);
    },
    stats: function (grade) {
      var c = CURRICULA[grade];
      if (!c) return null;
      var lessons = c.reduce(function (a, s) { return a + s.lessons.length; }, 0);
      var exams = c.length + Math.floor(lessons / EXAM_EVERY);
      return { sections: c.length, lessons: lessons, exams: exams, total: lessons + exams };
    },
  };

})(typeof window !== 'undefined' ? window : globalThis);
