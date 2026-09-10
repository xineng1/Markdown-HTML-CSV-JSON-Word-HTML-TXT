"""校验导出的 .docx 是否为合法 OOXML 包。

用法：python test/check-docx.py test/results/export-check.docx
先跑 node test/smoke.js 生成样例文件。
"""
import sys
import zipfile
import xml.etree.ElementTree as ET

REQUIRED = [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/_rels/document.xml.rels",
    "word/styles.xml",
]


def main(path):
    z = zipfile.ZipFile(path)
    ok = True

    print(f"包内文件（共 {len(z.namelist())} 个）：")
    for n in z.namelist():
        print(f"  - {n}  {z.getinfo(n).file_size} bytes")

    bad = z.testzip()
    print(f"\nzip 完整性：{'OK' if bad is None else '损坏 -> ' + str(bad)}")
    ok &= bad is None

    print("\nXML 部件解析：")
    for n in z.namelist():
        if n.endswith((".xml", ".rels")):
            try:
                ET.fromstring(z.read(n))
                print(f"  OK    {n}")
            except Exception as e:  # noqa: BLE001
                ok = False
                print(f"  FAIL  {n}  {e}")

    missing = [n for n in REQUIRED if n not in z.namelist()]
    if missing:
        ok = False
        print(f"\n缺少必需部件：{missing}")
    else:
        print("\n必需部件齐全")

    d = z.read("word/document.xml").decode("utf-8")
    print("\n内容统计：")
    print(f"  段落      {d.count('<w:p>')}")
    print(f"  标题样式  {d.count('Heading')}")
    print(f"  表格      {d.count('<w:tbl>')}")
    print(f"  图片      {d.count('<w:drawing>')}")
    print(f"  代码块    {d.count('w:val=\"Code\"')}")

    media = [n for n in z.namelist() if n.startswith("word/media/")]
    if media:
        print(f"\n媒体文件：{media}")
        cx = z.read("word/document.xml").decode("utf-8")
        for m in media:
            target = m.replace("word/", "")
            if target not in z.read("word/_rels/document.xml.rels").decode("utf-8"):
                ok = False
                print(f"  FAIL  {m} 没有在 document.xml.rels 中登记")
            else:
                print(f"  OK    {m} 已登记到关系表")

    print("\n结论：" + ("结构合法，可被 Word 打开" if ok else "存在问题"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "test/results/export-check.docx"))
