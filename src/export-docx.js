/* =========================================================
 * MD Reader · Word(.docx) 导出
 * 自己生成 OOXML 并用 store 方式打包 zip，不依赖任何第三方库。
 * 对外暴露 window.MDDocx.toBlob(rootEl, {title}) -> Promise<Blob>
 * ========================================================= */
(function () {
  'use strict';

  var NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
    rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
    cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
    dc: 'http://purl.org/dc/elements/1.1/',
    dcterms: 'http://purl.org/dc/terms/',
    xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  };

  var EMU_PER_PX = 9525;
  var MAX_IMG_EMU = 5943600; // 约 16.5cm 正文宽度

  var XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function enc(str) { return new TextEncoder().encode(str); }

  /* ---------------- CRC32 + store 模式 zip ---------------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(data) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(entries) {
    var chunks = [];
    var central = [];
    var offset = 0;

    entries.forEach(function (e) {
      var nameBytes = enc(e.name);
      var data = e.data;
      var crc = crc32(data);
      var size = data.length;

      var local = new Uint8Array(30 + nameBytes.length);
      var dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true);   // UTF-8 文件名标志
      dv.setUint16(8, 0, true);        // store
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0x21, true);    // 1980-01-01
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      chunks.push(local, data);

      var cen = new Uint8Array(46 + nameBytes.length);
      var dv2 = new DataView(cen.buffer);
      dv2.setUint32(0, 0x02014b50, true);
      dv2.setUint16(4, 20, true);
      dv2.setUint16(6, 20, true);
      dv2.setUint16(8, 0x0800, true);
      dv2.setUint16(10, 0, true);
      dv2.setUint16(12, 0, true);
      dv2.setUint16(14, 0x21, true);
      dv2.setUint32(16, crc, true);
      dv2.setUint32(20, size, true);
      dv2.setUint32(24, size, true);
      dv2.setUint16(28, nameBytes.length, true);
      dv2.setUint16(30, 0, true);
      dv2.setUint16(32, 0, true);
      dv2.setUint16(34, 0, true);
      dv2.setUint16(36, 0, true);
      dv2.setUint32(38, 0, true);
      dv2.setUint32(42, offset, true);
      cen.set(nameBytes, 46);
      central.push(cen);

      offset += local.length + size;
    });

    var cenSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new Uint8Array(22);
    var dv3 = new DataView(eocd.buffer);
    dv3.setUint32(0, 0x06054b50, true);
    dv3.setUint16(4, 0, true);
    dv3.setUint16(6, 0, true);
    dv3.setUint16(8, entries.length, true);
    dv3.setUint16(10, entries.length, true);
    dv3.setUint32(12, cenSize, true);
    dv3.setUint32(16, offset, true);
    dv3.setUint16(20, 0, true);

    return new Blob(chunks.concat(central, [eocd]), {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  /* ---------------- OOXML 片段 ---------------- */
  function run(text, o) {
    o = o || {};
    if (text === '' && !o.force) return '';
    var rPr = '';
    if (o.bold) rPr += '<w:b/>';
    if (o.italic) rPr += '<w:i/>';
    if (o.strike) rPr += '<w:strike/>';
    if (o.underline) rPr += '<w:u w:val="single"/>';
    if (o.mono) rPr += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/>';
    if (o.color) rPr += '<w:color w:val="' + o.color + '"/>';
    if (o.size) rPr += '<w:sz w:val="' + o.size + '"/><w:szCs w:val="' + o.size + '"/>';
    rPr = rPr ? '<w:rPr>' + rPr + '</w:rPr>' : '';
    return '<w:r>' + rPr + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>';
  }

  function para(runs, styleId, extraPPr) {
    var pPr = (styleId ? '<w:pStyle w:val="' + styleId + '"/>' : '') + (extraPPr || '');
    return '<w:p>' + (pPr ? '<w:pPr>' + pPr + '</w:pPr>' : '') + runs + '</w:p>';
  }

  var HL_STYLE = {
    'hljs-keyword': { color: 'CF222E' },
    'hljs-string': { color: '0A7D32' },
    'hljs-comment': { color: '6E7781', italic: true },
    'hljs-number': { color: '0550AE' },
    'hljs-title': { color: '6639BA' },
    'hljs-attr': { color: '0550AE' },
    'hljs-built_in': { color: '953800' },
    'hljs-type': { color: '953800' },
    'hljs-literal': { color: 'CF222E' },
    'hljs-tag': { color: '116329' },
    'hljs-meta': { color: '6E7781' },
    'hljs-name': { color: 'CF222E' },
    'hljs-subst': { color: '24292F' },
  };

  function inlineRuns(node, inh) {
    inh = inh || {};
    var out = '';
    var kids = node.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 3) {
        out += run(n.nodeValue, inh);
        continue;
      }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();

      if (tag === 'br') { out += '<w:r><w:br/></w:r>'; continue; }
      if (tag === 'img' || tag === 'script' || tag === 'style' || tag === 'input') {
        if (tag === 'img') {
          var al = n.getAttribute('alt');
          out += run(al ? '［图片：' + al + '］' : '［图片］', { italic: true, color: '8C959F' });
        }
        continue;
      }

      var next = {};
      for (var k in inh) next[k] = inh[k];
      if (tag === 'strong' || tag === 'b') next.bold = true;
      else if (tag === 'em' || tag === 'i') next.italic = true;
      else if (tag === 'del' || tag === 's') next.strike = true;
      else if (tag === 'code' || tag === 'kbd' || tag === 'samp') { next.mono = true; next.color = 'C7254E'; }
      else if (tag === 'a') { next.color = '0563C1'; next.underline = true; }
      else if (tag === 'mark') { next.color = 'AA6D00'; next.bold = true; }
      else if (tag.indexOf('hljs-') === 0) {
        var st = HL_STYLE[tag];
        if (st) { for (var kk in st) next[kk] = st[kk]; }
      }
      out += inlineRuns(n, next);
    }
    return out;
  }

  function cellXml(text, isHeader, widthTwips) {
    var runs = text.split('\n').map(function (line) {
      return para(run(line, isHeader ? { bold: true } : {}));
    }).join('') || para('');
    return '<w:tc><w:tcPr><w:tcW w:w="' + widthTwips + '" w:type="dxa"/>' +
      (isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F3F5"/>' : '') +
      '</w:tcPr>' + runs + '</w:tc>';
  }

  function tableXml(table) {
    var rows = Array.prototype.slice.call(table.querySelectorAll('tr'));
    if (!rows.length) return '';
    var colCount = 0;
    rows.forEach(function (tr) {
      colCount = Math.max(colCount, tr.children.length);
    });
    if (!colCount) return '';
    var totalTwips = 9350;
    var colTwips = Math.floor(totalTwips / colCount);

    var borders =
      '<w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
        return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="C9CDD4"/>';
      }).join('') +
      '</w:tblBorders>';

    var body = rows.map(function (tr) {
      var isHeader = tr.parentNode && tr.parentNode.tagName.toLowerCase() === 'thead';
      var cells = Array.prototype.slice.call(tr.children).map(function (td) {
        return cellXml((td.textContent || '').trim(), isHeader, colTwips);
      }).join('');
      return '<w:tr>' + cells + '</w:tr>';
    }).join('');

    var grid = new Array(colCount + 1).join('<w:gridCol w:w="' + colTwips + '"/>');

    return '<w:tbl><w:tblPr><w:tblW w:w="' + totalTwips + '" w:type="dxa"/>' + borders +
      '<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + grid + '</w:tblGrid>' + body + '</w:tbl>' +
      para('');
  }

  function imageXml(rid, idNum, name, cx, cy) {
    return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + idNum + '" name="' + esc(name) + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="' + NS.pic + '">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + idNum + '" name="' + esc(name) + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  }

  /* ---------------- 图片处理 ---------------- */
  function loadImage(src) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      im.src = src;
    });
  }

  function canvasToPngBytes(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) {
        if (!b) return resolve(null);
        b.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); });
      }, 'image/png');
    });
  }

  async function collectImage(img, ctx) {
    var src = img.currentSrc || img.getAttribute('src') || '';
    if (!src) return null;
    var im = await loadImage(src);
    if (!im || !im.naturalWidth) return null;

    var w = im.naturalWidth;
    var h = im.naturalHeight;
    var bytes = null;
    var ext = 'png';
    var mime = 'image/png';

    var isSvg = /^data:image\/svg/i.test(src) || /\.svg($|\?)/i.test(src);

    try {
      if (isSvg) {
        // Word 不支持 SVG，光栅化成 PNG
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var c2d = canvas.getContext('2d');
        c2d.fillStyle = '#ffffff';
        c2d.fillRect(0, 0, w, h);
        c2d.drawImage(im, 0, 0, w, h);
        bytes = await canvasToPngBytes(canvas);
      } else {
        var resp = await fetch(src);
        var blob = await resp.blob();
        mime = blob.type || 'image/png';
        if (/jpe?g/i.test(mime)) ext = 'jpg';
        else if (/gif/i.test(mime)) ext = 'gif';
        else if (/bmp/i.test(mime)) { mime = 'image/png'; ext = 'png'; }
        else { mime = 'image/png'; ext = 'png'; }
        bytes = new Uint8Array(await blob.arrayBuffer());
      }
    } catch (e) {
      return null;
    }
    if (!bytes || !bytes.length) return null;
    if (!/^image\/(png|jpeg|gif)$/i.test(mime)) { mime = 'image/png'; ext = 'png'; }

    var cx = w * EMU_PER_PX;
    var cy = h * EMU_PER_PX;
    if (cx > MAX_IMG_EMU) {
      var ratio = MAX_IMG_EMU / cx;
      cx = Math.round(cx * ratio);
      cy = Math.round(cy * ratio);
    }

    var idx = ++ctx.imgSeq;
    var fileName = 'image' + idx + '.' + ext;
    var rid = 'rId' + (++ctx.relSeq);
    ctx.media.push({ name: 'word/media/' + fileName, data: bytes });
    ctx.rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + fileName + '"/>');
    return { rid: rid, id: idx, name: fileName, cx: Math.round(cx), cy: Math.round(cy) };
  }

  /* ---------------- 块级遍历 ---------------- */
  async function walk(node, ctx, opts) {
    opts = opts || {};
    var out = '';
    var kids = node.childNodes || [];

    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.nodeType === 3) {
        var t = el.nodeValue;
        if (t && t.trim()) out += para(run(t), opts.style);
        continue;
      }
      if (el.nodeType !== 1) continue;

      var tag = el.tagName.toLowerCase();
      var style = opts.style;
      var indent = opts.indent || 0;

      var H = /^h([1-6])$/.exec(tag);
      if (H) {
        out += para(inlineRuns(el, { bold: true }), 'Heading' + H[1]);
        continue;
      }

      if (tag === 'p') {
        var imgs = el.querySelectorAll('img');
        var onlyImg = imgs.length === 1 && (el.textContent || '').trim() === '';
        if (onlyImg) {
          var d = await collectImage(imgs[0], ctx);
          if (d) { out += imageXml(d.rid, d.id, d.name, d.cx, d.cy); continue; }
        }
        var runs = inlineRuns(el);
        out += runs ? para(runs, style, indentXml(indent)) : (style === 'Quote' ? '' : para(''));
        continue;
      }

      if (tag === 'img') {
        var d2 = await collectImage(el, ctx);
        if (d2) out += imageXml(d2.rid, d2.id, d2.name, d2.cx, d2.cy);
        continue;
      }

      if (tag === 'ul' || tag === 'ol') {
        out += await listXml(el, ctx, opts, indent);
        continue;
      }

      if (tag === 'pre') {
        var codeEl = el.querySelector('code') || el;
        var runs = codeRuns(codeEl, { mono: true, size: 19 });
        out += para(runs || run(' ', { mono: true, size: 19 }), 'Code',
          '<w:spacing w:after="240"/>');
        continue;
      }

      if (tag === 'blockquote') {
        out += await walk(el, ctx, { style: 'Quote', indent: indent });
        continue;
      }

      if (tag === 'table') {
        out += tableXml(el);
        continue;
      }

      if (tag === 'hr') {
        out += para('', null, '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D0D5DD"/></w:pBdr>');
        continue;
      }

      if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' ||
        tag === 'header' || tag === 'footer' || tag === 'body' || tag === 'details') {
        if (tag === 'details') { continue; }
        out += await walk(el, ctx, opts);
        continue;
      }

      if (tag === 'dl') {
        out += await walk(el, ctx, { style: style });
        continue;
      }

      // 兜底：当作段落
      var r2 = inlineRuns(el);
      if (r2) out += para(r2, style, indentXml(indent));
    }
    return out;
  }

  // 代码块：整体作一个段落，换行用 <w:br/>，这样高亮着色能保留下来
  function codeRuns(node, inh) {
    var out = '';
    var kids = node.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 3) {
        var parts = String(n.nodeValue).split('\n');
        for (var p = 0; p < parts.length; p++) {
          if (p > 0) out += '<w:r><w:br/></w:r>';
          if (parts[p] !== '') out += run(parts[p], inh);
        }
      } else if (n.nodeType === 1) {
        var tag = n.tagName.toLowerCase();
        var next = {};
        for (var k in inh) next[k] = inh[k];
        if (tag.indexOf('hljs-') === 0) {
          var st = HL_STYLE[tag];
          if (st) { for (var kk in st) next[kk] = st[kk]; }
        }
        out += codeRuns(n, next);
      }
    }
    return out;
  }

  function indentXml(indent) {
    if (!indent) return '';
    return '<w:ind w:left="' + indent + '"/>';
  }

  async function listXml(listEl, ctx, opts, indent) {
    var ordered = listEl.tagName.toLowerCase() === 'ol';
    var start = parseInt(listEl.getAttribute('start') || '1', 10) || 1;
    var out = '';
    var items = Array.prototype.slice.call(listEl.children).filter(function (c) {
      return c.tagName && c.tagName.toLowerCase() === 'li';
    });

    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var marker = (ordered ? (start + i) + '. ' : '\u2022 ');
      var cb = li.querySelector(':scope > input[type="checkbox"]');
      if (cb) marker = cb.checked ? '\u2611 ' : '\u2610 ';

      var runs = '';
      var nested = [];
      for (var j = 0; j < li.childNodes.length; j++) {
        var c = li.childNodes[j];
        if (c.nodeType === 1) {
          var tg = c.tagName.toLowerCase();
          if (tg === 'ul' || tg === 'ol') { nested.push(c); continue; }
          if (tg === 'input') continue;
          if (tg === 'p') { runs += inlineRuns(c); continue; }
        }
        runs += inlineRuns(c, {});
      }
      out += para(run(marker) + runs, 'ListPara', indentXml(indent));
      for (var k = 0; k < nested.length; k++) {
        out += await listXml(nested[k], ctx, opts, indent + 360);
      }
    }
    return out;
  }

  /* ---------------- 打包 ---------------- */
  var STYLES_XML = XML_DECL +
    '<w:styles xmlns:w="' + NS.w + '">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="\u7b49\u7ebf" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="312" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    headingStyle(1, 40) + headingStyle(2, 32) + headingStyle(3, 28) +
    headingStyle(4, 24) + headingStyle(5, 22) + headingStyle(6, 22) +
    '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>' +
    '<w:spacing w:before="0" w:after="0" w:line="260" w:lineRule="auto"/>' +
    '<w:ind w:left="140" w:right="140"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C8CCD4"/></w:pBdr></w:pPr>' +
    '<w:rPr><w:i/><w:color w:val="656D76"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="ListPara"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr></w:style>' +
    '</w:styles>';

  function headingStyle(level, sz) {
    return '<w:style w:type="paragraph" w:styleId="Heading' + level + '">' +
      '<w:name w:val="heading ' + level + '"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
      '<w:pPr><w:keepNext/><w:outlineLvl w:val="' + (level - 1) + '"/>' +
      '<w:spacing w:before="280" w:after="140"/></w:pPr>' +
      '<w:rPr><w:b/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr></w:style>';
  }

  async function toBlob(rootEl, options) {
    options = options || {};
    var ctx = { media: [], rels: [], imgSeq: 0, relSeq: 1 };

    var body = await walk(rootEl, ctx, {});
    if (!body) body = para('');

    var documentXml = XML_DECL +
      '<w:document xmlns:w="' + NS.w + '" xmlns:r="' + NS.r + '" xmlns:wp="' + NS.wp +
      '" xmlns:a="' + NS.a + '" xmlns:pic="' + NS.pic + '">' +
      '<w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';

    var hasImg = ctx.media.length > 0;
    var contentTypes = XML_DECL +
      '<Types xmlns="' + NS.ct + '">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="gif" ContentType="image/gif"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';

    var rootRels = XML_DECL +
      '<Relationships xmlns="' + NS.rel + '">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';

    var docRels = XML_DECL +
      '<Relationships xmlns="' + NS.rel + '">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      ctx.rels.join('') +
      '</Relationships>';

    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var coreXml = XML_DECL +
      '<cp:coreProperties xmlns:cp="' + NS.cp + '" xmlns:dc="' + NS.dc + '" xmlns:dcterms="' + NS.dcterms + '" xmlns:xsi="' + NS.xsi + '">' +
      '<dc:title>' + esc(options.title || '') + '</dc:title>' +
      '<dc:creator>MD Reader</dc:creator>' +
      '<cp:lastModifiedBy>MD Reader</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
      '</cp:coreProperties>';

    var appXml = XML_DECL +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      '<Application>MD Reader</Application><AppVersion>1.0</AppVersion></Properties>';

    var entries = [
      { name: '[Content_Types].xml', data: enc(contentTypes) },
      { name: '_rels/.rels', data: enc(rootRels) },
      { name: 'word/document.xml', data: enc(documentXml) },
      { name: 'word/_rels/document.xml.rels', data: enc(docRels) },
      { name: 'word/styles.xml', data: enc(STYLES_XML) },
      { name: 'docProps/core.xml', data: enc(coreXml) },
      { name: 'docProps/app.xml', data: enc(appXml) },
    ].concat(ctx.media);

    return zipStore(entries);
  }

  window.MDDocx = { toBlob: toBlob };
})();
