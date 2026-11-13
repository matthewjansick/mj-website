---
title: Errors and debugging
goal: Read any traceback calmly, know the common error types, and handle bad input with try and except.
---
## Reading a traceback

When Python crashes it prints a **traceback**. People panic and skip it. Do not. It tells you three things: **where** (the line number), **what kind** (the error type), and **why** (the message). Read from the bottom up.

```python
def average(numbers):
    return sum(numbers) / len(numbers)

print(average([4, 8]))
print(average([]))
```

Bottom line: `ZeroDivisionError: division by zero`. Above it: the line inside `average`. Above that: the line that called `average`. The empty list has length 0, so Python divided by 0.

## The usual suspects

| Error | Usually means |
|---|---|
| `SyntaxError` | Python cannot even read the line. Missing quote, bracket or colon. |
| `IndentationError` | Spaces at the start of a line are wrong. |
| `NameError` | You used a name that does not exist. Typo, or defined later. |
| `TypeError` | Mixing types that do not go together, like `"a" + 1`. |
| `ValueError` | Right type, impossible value. `int("hello")`. |
| `IndexError` | Position past the end of a list or string. |
| `KeyError` | Dictionary key that is not there. |
| `ZeroDivisionError` | Dividing by zero. |
| `AttributeError` | `.something` that the object does not have. |

Each of these is in the program below. Uncomment one line at a time, run it, read the message, comment it back out.

```python
numbers = [1, 2, 3]
# print(numbers[5])
# print(int("twelve"))
# print(undefined_variable)
# print("Age: " + 13)
# print(numbers.push(4))
# print({"a": 1}["b"])
```

## Bugs that do not crash

The sneakiest bugs run without any error and just give the wrong answer. The fix is the same as always: print things and look.

```python
def total_price(prices):
    total = 0
    for price in prices:
        total = price
    return total

print(total_price([10, 20, 30]))
```

That prints 30, not 60. Add `print(total)` inside the loop and watch what happens to `total` each time around. Then fix the bug.

## try and except

Sometimes an error is expected: the user typed letters where you wanted a number. `try` runs code that might fail; `except` catches the failure so the program can carry on.

```python
text = input("Enter a number: ")
try:
    number = int(text)
    print(f"Double that is {number * 2}")
except ValueError:
    print("That is not a number!")
```

Name the error type after `except`. A bare `except:` catches everything, which hides bugs you want to see.

## Asking until the input is valid

Combine `try` with a loop and you get the single most useful pattern for interactive programs:

```python
while True:
    try:
        age = int(input("Age: "))
        break
    except ValueError:
        print("Please type a whole number.")
print(f"You are {age}")
```

## Raising your own errors

When a function receives something that makes no sense, it can **raise** an error on purpose.

```python
def withdraw(balance, amount):
    if amount > balance:
        raise ValueError("Not enough money")
    return balance - amount

print(withdraw(100, 30))
print(withdraw(100, 300))
```

::: tip
Three debugging moves that solve most problems: read the last line of the traceback, print the variable you are suspicious of, and run a tiny version of the problem in the Playground.
:::

::: exercise id=err-fix title="Fix the three bugs"
This program should print the average of the scores, rounded to 1 decimal. It has three bugs: one crashes, one gives the wrong answer, and one is a typo. Fix all three.

```python
scores = [80, 90, 100]
total = 0
for score in scores
    total += scores
print(f"Average: {total / len(scores):.1f}")
```
--- tests
[
  {"name": "Prints Average: 90.0", "last_line": "Average: 90.0"},
  {"name": "Still uses a loop", "code_regex": [{"pattern": "^\\s*for\\b", "why": "Keep the for loop."}]}
]
--- hints
- Read the error message first. The for line is missing something.
- Inside the loop, which variable is the single score?
--- solution
```python
scores = [80, 90, 100]
total = 0
for score in scores:
    total += score
print(f"Average: {total / len(scores):.1f}")
```
:::

::: exercise id=err-safe-int title="Safe number input"
Write `ask_number(prompt)` that keeps asking with the given prompt until the user types a valid whole number, then returns it as an int. Print `Not a number, try again` after each bad attempt.

```python

```
--- tests
[
  {"name": "Valid first time", "calls": [{"expr": "ask_number('N: ')", "stdin": ["42"], "expect": "42"}]},
  {"name": "Retries after junk", "calls": [{"expr": "ask_number('N: ')", "stdin": ["abc", "4.5", "7"], "expect": "7", "prints_contains": "Not a number, try again"}]},
  {"name": "Negative numbers are fine", "calls": [{"expr": "ask_number('N: ')", "stdin": ["-3"], "expect": "-3"}]},
  {"name": "Uses try/except ValueError", "code_regex": [{"pattern": "^\\s*try:", "why": "Use try."}, {"pattern": "except\\s+ValueError", "why": "Catch ValueError specifically."}]}
]
--- hints
- while True: try: return int(input(prompt)) except ValueError: print(...)
--- solution
```python
def ask_number(prompt):
    while True:
        try:
            return int(input(prompt))
        except ValueError:
            print("Not a number, try again")
```
:::

::: exercise id=err-divide title="Safe division"
Write `safe_divide(a, b)` that returns `a / b`, but returns the string `"undefined"` instead of crashing when `b` is zero. Use `try` and `except ZeroDivisionError`.

```python

```
--- tests
[
  {"name": "10 / 4", "calls": [{"expr": "safe_divide(10, 4)", "expect": "2.5"}]},
  {"name": "Divide by zero", "calls": [{"expr": "safe_divide(5, 0)", "expect": "'undefined'"}]},
  {"name": "Uses except ZeroDivisionError", "code_regex": [{"pattern": "except\\s+ZeroDivisionError", "why": "Catch ZeroDivisionError."}]}
]
--- hints
- try: return a / b, except ZeroDivisionError: return "undefined"
--- solution
```python
def safe_divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return "undefined"
```
:::

::: exercise id=err-raise title="Validate the age"
Write `check_age(age)` that returns the age unchanged if it is between 0 and 150 inclusive, and raises a `ValueError` with the message `Impossible age` otherwise.

```python

```
--- tests
[
  {"name": "13 is fine", "calls": [{"expr": "check_age(13)", "expect": "13"}]},
  {"name": "0 and 150 are fine", "calls": [{"expr": "check_age(0)", "expect": "0"}, {"expr": "check_age(150)", "expect": "150"}]},
  {"name": "-1 raises ValueError", "calls": [{"expr": "check_age(-1)", "raises": "ValueError"}]},
  {"name": "200 raises ValueError with the message", "calls": [{"expr": "check_age(200)", "raises": "ValueError", "message": "Impossible age"}]},
  {"name": "Uses raise", "code_regex": [{"pattern": "raise\\s+ValueError\\(", "why": "Raise a ValueError for impossible ages."}]}
]
--- hints
- if age < 0 or age > 150: raise ValueError("Impossible age")
- Then return age.
--- solution
```python
def check_age(age):
    if age < 0 or age > 150:
        raise ValueError("Impossible age")
    return age
```
:::

## What you learned

- Read tracebacks bottom up: type, message, line.
- `try` / `except SomeError:` handles expected failures without crashing.
- `raise ValueError("message")` reports impossible input from your own functions.
- When output is wrong but nothing crashed, print your variables.
