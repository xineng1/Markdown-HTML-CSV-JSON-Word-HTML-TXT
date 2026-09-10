# MD Reader 功能演示

> 这是一份用于自测的样例文档，覆盖了常见 Markdown 语法。
> 拖入 `test/fixtures` 整个文件夹即可看到左侧出现两篇文档，图片也会正常显示。

## 一、文本样式

**加粗**、*斜体*、***粗斜体***、~~删除线~~、`行内代码`，以及普通段落。

这里是一个[外部链接](https://commonmark.org)，以及一个[内部文档链接](sub/other.md)，点击会直接跳到左侧列表里的另一篇文档。

## 二、列表

### 无序列表

- 苹果
- 香蕉
  - 香蕉干
  - 香蕉派
- 橙子

### 有序列表

1. 取样本
2. 加裂解液
3. 离心 12000 rpm，10 min

### 任务列表

- [x] 完成文献检索
- [x] 确定实验方案
- [ ] 跑完第一批数据
- [ ] 写结果分析

## 三、代码块

Python 示例：

```python
import numpy as np

def od600_to_cfu(od: float) -> float:
    """OD600 换算菌落数（粗略估计）"""
    return od * 8e8

if __name__ == "__main__":
    print(f"{od600_to_cfu(0.6):.2e} CFU/mL")
```

JavaScript 示例：

```js
const files = ['a.md', 'b.md'];
const mdFiles = files.filter(f => f.endsWith('.md'));
console.log(`共 ${mdFiles.length} 个 Markdown 文件`);
```

Bash 示例：

```bash
cd ~/projects/md-reader
node scripts/build.js
```

未标注语言的代码块：

```
plain text block
should still render fine
```

## 四、表格

| 指标 | 单位 | 对照组 | 实验组 |
| --- | --- | --- | --- |
| 总磷 TP | mg/L | 0.12 | 0.04 |
| 总氮 TN | mg/L | 1.85 | 0.63 |
| 溶解氧 DO | mg/L | 4.2 | 7.9 |
| 氨氮 NH3-N | mg/L | 0.98 | 0.21 |

## 五、引用与分割线

> 实验记录要当天写完，隔夜的记忆不可靠。
>
> —— 实验室守则第一条

---

## 六、图片

本地相对路径图片（拖入整个文件夹时才会显示）：

![示例封面](assets/cover.svg)

下面这张故意指向不存在的图片，用于验证缺失图片的提示：

![缺失的图](assets/not-exist.png)

## 七、HTML 与脚注

支持少量内联 HTML，例如 <kbd>Ctrl</kbd> + <kbd>K</kbd> 这样的按键样式，以及 <mark>高亮文本</mark>。

## 八、长段落（用于测试滚动与阅读进度）

富营养化是指水体中氮、磷等营养盐含量过高，导致藻类及其他浮游生物迅速繁殖、水体溶解氧下降、水质恶化的现象。评价富营养化的常用指标包括总磷、总氮、叶绿素 a、透明度与高锰酸盐指数，其中总磷通常是淡水水体富营养化限值的关键控制因子。

在实际监测中，样品采集后应尽快冷藏并在 24 h 内完成分析；测定总磷时通常采用过硫酸钾消解—钼酸铵分光光度法，测定总氮则常用碱性过硫酸钾消解—紫外分光光度法。溶解氧建议使用现场便携式溶氧仪测定，避免运输过程造成偏差。
