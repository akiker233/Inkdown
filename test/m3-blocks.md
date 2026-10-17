# 一级标题 H1

## 二级标题 H2

### 三级标题 H3

Setext 一级标题
================

> 引用第一行 **加粗**
> 引用第二行，行内公式 $E = mc^2$。
>
> > 嵌套引用
> > 继续嵌套

- 普通项目一
- 普通项目二
  - 嵌套项目
    - 更深一层
- 普通项目三

1. 有序项目一
2. 有序项目二
   1. 嵌套有序

- [ ] 未完成任务
- [x] 已完成任务
1. [ ] 有序任务

---

```ts
interface Point {
  x: number
  y: number
}

const p: Point = { x: 1, y: 2 }
console.log(p)
```

```python
def greet(name):
    return f"Hello, {name}!"
```

```js
```

```rust
fn main() {
    println!("unclosed");
}
```

    缩进代码块
    const legacy = true

行内公式：$a^2 + b^2 = c^2$，还有一个 $x_1 + x_2$。

$$
\int_{0}^{1} x^2\,dx = \frac{1}{3}
$$

图片：

![示例图片](assets/sample.svg)

缺图测试：![不存在](assets/missing.png)

**加粗** *斜体* ~~删除线~~ `inline code` ==高亮== [链接](https://example.com)
