---
title: Functions
goal: Package code into named, reusable functions with parameters, and understand why programmers love them.
---
## You already use functions

`print()`, `input()`, `len()`, `int()` are all functions: named chunks of code that do a job. Now you will write your own.

```python
def greet():
    print("Hello!")
    print("Welcome to the program.")

greet()
greet()
```

Breaking it down:

- `def` starts a function definition. Then the name, parentheses, and a colon.
- The indented block is the **body**: what the function does.
- Defining a function does not run it. `greet()` with parentheses **calls** it.

Define first, call later. Python reads top to bottom, so a call above the `def` fails.

## Parameters

Functions get interesting when you can hand them information. Names inside the parentheses are **parameters**: variables that get filled in each time you call.

```python
def greet(name):
    print(f"Hello, {name}!")

greet("Ada")
greet("Grace")
```

Several parameters are separated by commas:

```python
def describe_pet(animal, name, age):
    print(f"{name} is a {age}-year-old {animal}.")

describe_pet("dog", "Rex", 4)
describe_pet("cat", "Luna", 11)
```

The values you pass in are called **arguments**. They are matched to the parameters by position.

## Returning a result

Printing shows something to a human. **Returning** hands a value back to the code that called the function, so it can be stored or used in more math.

```python
def double(n):
    return n * 2

result = double(21)
print(result)
print(double(5) + double(10))
```

`return` ends the function immediately and sends the value back. A function with no `return` gives back `None`.

```python
def add(a, b):
    print(a + b)       # shows it, but returns nothing

x = add(2, 3)
print(x)
```

::: warning
"Print vs return" trips up everyone at first. If you need to *use* the answer later, return it. If you only need to *show* it, print it. Exercises here will tell you which one they want.
:::

## Why bother?

Three reasons:

1. **No repeating.** Write the code once, call it anywhere.
2. **Names explain.** `calculate_tax(price)` says what it does. Forty lines of math do not.
3. **Fix once.** If there is a bug, you fix it in one place.

Here is a program before and after functions. The second one is easier to read, even though it is longer.

```python
# Before
print("=" * 20)
print("INVENTORY")
print("=" * 20)
print("=" * 20)
print("SHOP")
print("=" * 20)

# After
def banner(title):
    print("=" * 20)
    print(title)
    print("=" * 20)

banner("INVENTORY")
banner("SHOP")
```

## Functions calling functions

```python
def square(n):
    return n * n

def sum_of_squares(a, b):
    return square(a) + square(b)

print(sum_of_squares(3, 4))
```

::: exercise id=fn-hello title="A greeting function"
Write a function `greet(name)` that **prints** `Hello, NAME! Nice to see you.` Then call it twice, once with `Ada` and once with `Linus`.

```python

```
--- tests
[
  {"name": "Defines greet", "must_define_function": ["greet"]},
  {"name": "greet('Ada') prints the right line", "calls": [{"expr": "greet('Ada')", "prints": "Hello, Ada! Nice to see you."}]},
  {"name": "greet('Zed') works too", "calls": [{"expr": "greet('Zed')", "prints": "Hello, Zed! Nice to see you."}]},
  {"name": "Program calls it for Ada and Linus", "output_contains": ["Hello, Ada! Nice to see you.", "Hello, Linus! Nice to see you."]}
]
--- hints
- def greet(name): then an indented print with an f-string.
- Call it after the definition: greet("Ada")
--- solution
```python
def greet(name):
    print(f"Hello, {name}! Nice to see you.")

greet("Ada")
greet("Linus")
```
:::

::: exercise id=fn-area title="Return the area"
Write a function `rectangle_area(width, height)` that **returns** the area (width times height). It should not print anything. Then print `rectangle_area(3, 4)`.

```python

```
--- tests
[
  {"name": "rectangle_area(3, 4) returns 12", "calls": [{"expr": "rectangle_area(3, 4)", "expect": "12", "no_print": true}]},
  {"name": "rectangle_area(10, 2.5) returns 25.0", "calls": [{"expr": "rectangle_area(10, 2.5)", "expect": "25.0"}]},
  {"name": "Program prints 12", "output_contains": "12"}
]
--- hints
- The body is one line: return width * height
--- solution
```python
def rectangle_area(width, height):
    return width * height

print(rectangle_area(3, 4))
```
:::

::: exercise id=fn-celsius title="Temperature converter"
Write `to_fahrenheit(celsius)` that returns the Fahrenheit value: multiply by 9, divide by 5, add 32. Then write `to_celsius(fahrenheit)` that does the reverse: subtract 32, multiply by 5, divide by 9. Print `to_fahrenheit(100)` and `to_celsius(212)`.

```python

```
--- tests
[
  {"name": "to_fahrenheit(100) is 212", "calls": [{"expr": "to_fahrenheit(100)", "expect": "212.0"}]},
  {"name": "to_fahrenheit(0) is 32", "calls": [{"expr": "to_fahrenheit(0)", "expect": "32.0"}]},
  {"name": "to_celsius(212) is 100", "calls": [{"expr": "to_celsius(212)", "expect": "100.0"}]},
  {"name": "to_celsius(-40) is -40", "calls": [{"expr": "to_celsius(-40)", "expect": "-40.0"}]},
  {"name": "Both functions return rather than print", "calls": [{"expr": "to_fahrenheit(37)", "no_print": true}, {"expr": "to_celsius(98.6)", "no_print": true}]}
]
--- hints
- return celsius * 9 / 5 + 32
- return (fahrenheit - 32) * 5 / 9. The parentheses matter.
--- solution
```python
def to_fahrenheit(celsius):
    return celsius * 9 / 5 + 32

def to_celsius(fahrenheit):
    return (fahrenheit - 32) * 5 / 9

print(to_fahrenheit(100))
print(to_celsius(212))
```
:::

::: exercise id=fn-line title="Repeat a character"
Write `line(character, length)` that **returns** a string made of `character` repeated `length` times. Then write `box(width)` that **prints** a box: a top line of `+` repeated `width` times, a middle line of `|` then spaces then `|` (total width), and a bottom line like the top. For `box(5)`:

```text
+++++
|   |
+++++
```
```python

```
--- tests
[
  {"name": "line('-', 4) returns ----", "calls": [{"expr": "line('-', 4)", "expect": "'----'", "no_print": true}]},
  {"name": "line('ab', 3) returns ababab", "calls": [{"expr": "line('ab', 3)", "expect": "'ababab'"}]},
  {"name": "box(5) prints the box", "calls": [{"expr": "box(5)", "prints": "+++++\n|   |\n+++++"}]},
  {"name": "box(3) prints a small box", "calls": [{"expr": "box(3)", "prints": "+++\n| |\n+++"}]},
  {"name": "box uses line", "code_regex": [{"pattern": "def box[\\s\\S]*line\\(", "why": "box should call your line function instead of repeating the logic."}]}
]
--- hints
- line is one line: return character * length
- The middle row is "|" + line(" ", width - 2) + "|"
--- solution
```python
def line(character, length):
    return character * length

def box(width):
    print(line("+", width))
    print("|" + line(" ", width - 2) + "|")
    print(line("+", width))

box(5)
```
:::

## What you learned

- `def name(parameters):` defines a function. `name(arguments)` calls it.
- `return` sends a value back. `print` only shows it.
- Functions make code shorter, clearer, and easier to fix.
