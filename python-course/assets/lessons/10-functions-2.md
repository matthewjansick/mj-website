---
title: Functions, level 2
goal: Use default values, return more than one thing, understand where variables live, and test your own functions.
---
## Default values

A parameter can have a default, used when the caller leaves it out.

```python
def greet(name, greeting="Hello"):
    print(f"{greeting}, {name}!")

greet("Ada")
greet("Ada", "Good morning")
```

Parameters with defaults must come after the ones without.

## Naming your arguments

You can pass arguments by name. This makes calls readable and lets you skip defaults in the middle.

```python
def make_character(name, health=100, weapon="fists"):
    print(f"{name}: {health} HP, armed with {weapon}")

make_character("Rogue")
make_character("Knight", weapon="sword")
make_character(health=50, name="Goblin")
```

## Returning early

`return` can appear anywhere. The function stops at the first one it reaches. This is handy for checks at the top.

```python
def describe_number(n):
    if n < 0:
        return "negative"
    if n == 0:
        return "zero"
    return "positive"

print(describe_number(-5))
print(describe_number(0))
print(describe_number(12))
```

## Returning more than one thing

Separate values with commas and Python packs them together. Unpack them on the other side.

```python
def min_max(numbers):
    return min(numbers), max(numbers)

lowest, highest = min_max([4, 9, 1, 7])
print(lowest)
print(highest)
```

## Where variables live

A variable created inside a function exists only inside that function. This is called **local scope**. It is a feature: functions cannot accidentally mess with each other's variables.

```python
def count_up():
    count = 0
    count += 1
    print(f"inside: {count}")

count_up()
print(count)
```

The last line crashes because `count` only exists inside `count_up`. If a function needs to tell the outside world something, it should `return` it.

Functions *can* read variables from outside, which is fine for settings that never change:

```python
MAX_LIVES = 3

def show_lives(lives):
    print(f"{lives} of {MAX_LIVES} lives left")

show_lives(2)
```

::: tip
Names in ALL_CAPS are a convention for constants: values you set once and never change.
:::

## Docstrings

A string right under the `def` line describes what the function does. Python stores it and tools display it. Good habit, costs 10 seconds.

```python
def is_even(n):
    """Return True if n is an even number."""
    return n % 2 == 0

print(is_even(4))
print(is_even(7))
help(is_even)
```

## Testing your functions

Because functions return values, you can check them automatically with `assert`. If the condition is false, `assert` crashes with the message. If it is true, nothing happens, which is what you want.

```python
def is_even(n):
    return n % 2 == 0

assert is_even(4) == True, "4 should be even"
assert is_even(7) == False, "7 should be odd"
assert is_even(0) == True, "0 is even"
print("All tests passed")
```

This is exactly what the **Check** button does to your exercises. Now you can do it yourself.

::: exercise id=fn2-clamp title="Clamp"
Write `clamp(value, low=0, high=100)` that returns `low` if the value is below it, `high` if above it, and the value itself otherwise. Defaults are 0 and 100.

```python

```
--- tests
[
  {"name": "clamp(50) is 50", "calls": [{"expr": "clamp(50)", "expect": "50"}]},
  {"name": "clamp(150) is 100", "calls": [{"expr": "clamp(150)", "expect": "100"}]},
  {"name": "clamp(-20) is 0", "calls": [{"expr": "clamp(-20)", "expect": "0"}]},
  {"name": "clamp(7, 1, 5) is 5", "calls": [{"expr": "clamp(7, 1, 5)", "expect": "5"}]},
  {"name": "clamp(3, high=2) is 2", "calls": [{"expr": "clamp(3, high=2)", "expect": "2"}]}
]
--- hints
- if value < low: return low. if value > high: return high. return value.
--- solution
```python
def clamp(value, low=0, high=100):
    if value < low:
        return low
    if value > high:
        return high
    return value
```
:::

::: exercise id=fn2-stats title="Return two things"
Write `stats(numbers)` that returns two values: the total and the average of the list. Then unpack them from `stats([10, 20, 30])` into `total` and `average` and print `Total: 60, Average: 20.0`.

```python

```
--- tests
[
  {"name": "stats([10, 20, 30]) returns (60, 20.0)", "calls": [{"expr": "stats([10, 20, 30])", "expect": "(60, 20.0)"}]},
  {"name": "stats([5]) returns (5, 5.0)", "calls": [{"expr": "stats([5])", "expect": "(5, 5.0)"}]},
  {"name": "Prints the summary line", "output_contains": "Total: 60, Average: 20.0"},
  {"name": "Unpacks into total and average", "vars": [{"name": "total", "expect": "60"}, {"name": "average", "expect": "20.0"}]}
]
--- hints
- return sum(numbers), sum(numbers) / len(numbers)
- total, average = stats([10, 20, 30])
--- solution
```python
def stats(numbers):
    total = sum(numbers)
    return total, total / len(numbers)

total, average = stats([10, 20, 30])
print(f"Total: {total}, Average: {average}")
```
:::

::: exercise id=fn2-grade title="Letter grade with early returns"
Write `letter_grade(score)` that returns `"A"` for 90 and above, `"B"` for 80 to 89, `"C"` for 70 to 79, `"D"` for 60 to 69, and `"F"` below that. Use early returns instead of elif.

```python

```
--- tests
[
  {"name": "95 is A", "calls": [{"expr": "letter_grade(95)", "expect": "'A'"}]},
  {"name": "90 is A", "calls": [{"expr": "letter_grade(90)", "expect": "'A'"}]},
  {"name": "89 is B", "calls": [{"expr": "letter_grade(89)", "expect": "'B'"}]},
  {"name": "70 is C", "calls": [{"expr": "letter_grade(70)", "expect": "'C'"}]},
  {"name": "65 is D", "calls": [{"expr": "letter_grade(65)", "expect": "'D'"}]},
  {"name": "12 is F", "calls": [{"expr": "letter_grade(12)", "expect": "'F'"}]},
  {"name": "Uses several returns, no elif", "code_regex": [{"pattern": "return[\\s\\S]*return[\\s\\S]*return", "why": "Use a return for each grade."}], "code_not_regex": [{"pattern": "\\belif\\b", "why": "Try it with early returns instead of elif: each if just returns."}]}
]
--- hints
- if score >= 90: return "A". Then the next if does not need to check "below 90", because the function already returned.
--- solution
```python
def letter_grade(score):
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"
```
:::

::: exercise id=fn2-test title="Write the tests"
Here is a function `is_palindrome(word)` that should return True when a word reads the same backwards (like `level` or `racecar`). It has a bug. Add at least three `assert` lines under it that test it, run them to find the bug, fix the function, and finish with `print("All tests passed")`.

```python
def is_palindrome(word):
    """Return True if word reads the same forwards and backwards."""
    return word == word[::1]

# add asserts here

```
--- tests
[
  {"name": "level is a palindrome", "calls": [{"expr": "is_palindrome('level')", "expect": "True"}]},
  {"name": "python is not", "calls": [{"expr": "is_palindrome('python')", "expect": "False"}]},
  {"name": "racecar is", "calls": [{"expr": "is_palindrome('racecar')", "expect": "True"}]},
  {"name": "Has at least three asserts", "code_regex": [{"pattern": "assert[\\s\\S]*assert[\\s\\S]*assert", "why": "Write at least three assert lines."}]},
  {"name": "Prints All tests passed", "last_line": "All tests passed"}
]
--- hints
- word[::-1] reverses a string. word[::1] does not. One character is the bug.
- An assert for a non-palindrome: assert is_palindrome("python") == False
--- solution
```python
def is_palindrome(word):
    """Return True if word reads the same forwards and backwards."""
    return word == word[::-1]

assert is_palindrome("level") == True
assert is_palindrome("racecar") == True
assert is_palindrome("python") == False
print("All tests passed")
```
:::

## What you learned

- Defaults: `def f(x, y=10)`. Keyword arguments: `f(x, y=3)`.
- `return a, b` sends back several values; `a, b = f()` unpacks them.
- Variables made inside a function stay inside. Return what you need.
- `assert` lets you test your functions automatically.
