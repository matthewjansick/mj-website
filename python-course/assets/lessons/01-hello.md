---
title: Hello, Python
goal: Run your first program, understand what print does, and fix your first error.
---
## What is Python?

Python is a language for telling computers what to do. It runs games, websites, robots, science experiments, and a huge amount of the software you use every day. People like it because it reads almost like English.

The editor below is a real Python. Press **Run** (or Ctrl+Enter) and watch the output box.

```python
print("Hello, world!")
```

That line is a complete program. Here is what each part means:

- `print` is a **function**: a built-in command that does something. This one shows text.
- The parentheses `( )` hold what you give to the function.
- `"Hello, world!"` is a **string**: text, wrapped in quotes so Python knows it is words and not code.

::: tip
Change the words inside the quotes and run it again. You cannot break anything here. Breaking things is how you learn.
:::

## More than one line

Python runs your lines from top to bottom, one at a time.

```python
print("Line one")
print("Line two")
print("Line three")
```

You can print numbers too, and Python will do math for you. Notice there are no quotes around the numbers.

```python
print(7 + 3)
print(7 * 3)
print(100 - 1)
print("7 + 3")
```

Look at the last line. With quotes, Python prints the characters `7 + 3` exactly as written. Without quotes, it does the math. Quotes mean "this is text, leave it alone".

## Comments

A line starting with `#` is a **comment**. Python ignores it completely. Comments are notes for humans.

```python
# This is a comment. Python skips it.
print("Comments help you remember what your code does")  # they can go at the end of a line too
```

## Your first error

Errors are not failures. They are Python telling you exactly where it got confused. Run this on purpose:

```python
print("Where is my closing quote?)
```

Read the red text. It says `SyntaxError` and points at the line. There is a hint underneath too. Fix the quote and run it again.

::: note
Every programmer, including the people who built Python, sees errors every day. Reading the error calmly is the whole skill.
:::

::: exercise id=hello-name title="Say hello to yourself"
Print `Hello, ` followed by your name. For example, `Hello, Sam`. Any name is fine.

```python
# Print "Hello, " and your name on one line

```
--- tests
[
  {"name": "Prints a greeting that starts with Hello,", "output_regex": "^Hello, \\S+", "why": "The output should be one line starting with \"Hello, \" followed by a name."}
]
--- hints
- You need print, parentheses, and a string in quotes.
- Everything, including the comma and space, goes inside the quotes: print("Hello, Sam")
--- solution
```python
print("Hello, Sam")
```
:::

::: exercise id=hello-three title="Three lines"
Write a program that prints exactly these three lines:

```text
I am learning Python
It runs in my browser
This is line three
```
```python

```
--- tests
[
  {"name": "Prints the three lines exactly", "output_equals": "I am learning Python\nIt runs in my browser\nThis is line three"}
]
--- hints
- One print for each line.
- Capital letters and spaces have to match exactly. Python is picky, which is actually a good thing.
--- solution
```python
print("I am learning Python")
print("It runs in my browser")
print("This is line three")
```
:::

::: exercise id=hello-math title="Let Python do the math"
Print the answer to `365 * 24` (the number of hours in a year). Do not type the answer yourself. Let Python calculate it.

```python

```
--- tests
[
  {"name": "Prints 8760", "output_equals": "8760"},
  {"name": "Uses the * operator", "code_regex": [{"pattern": "365\\s*\\*\\s*24|24\\s*\\*\\s*365", "why": "Write the multiplication (365 * 24) and let Python work it out."}]}
]
--- hints
- No quotes this time. print(365 * 24)
--- solution
```python
print(365 * 24)
```
:::

::: exercise id=hello-fix title="Fix the broken program"
This program has two mistakes. Run it, read the error, fix it, run it again. Repeat until it prints both lines.

```python
print("Welcome to the game)
primt("Press Enter to start")
```
--- tests
[
  {"name": "Prints the welcome line", "output_contains": "Welcome to the game"},
  {"name": "Prints the start line", "output_contains": "Press Enter to start"},
  {"name": "Prints exactly two lines", "output_lines": 2}
]
--- hints
- The first line is missing a closing quote.
- Look very closely at the spelling of print on the second line.
--- solution
```python
print("Welcome to the game")
print("Press Enter to start")
```
:::

## What you learned

- `print()` shows things on the screen.
- Text goes in quotes. Numbers do not.
- `#` starts a comment.
- Errors point to the problem. Read them.
