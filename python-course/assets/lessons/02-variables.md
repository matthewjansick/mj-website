---
title: Variables and numbers
goal: Store values in named boxes, do math with them, and pick names that make sense.
---
## Variables are labeled boxes

A **variable** is a name that points to a value. You create one with `=`. Read `=` as "becomes", not "equals".

```python
score = 0
print(score)

score = score + 10
print(score)

score = score + 10
print(score)
```

The line `score = score + 10` looks strange if you think of `=` as math. In Python it means: take the current value of `score`, add 10, and store the result back in `score`.

## Naming things

Names can use letters, numbers and underscores, but cannot start with a number and cannot contain spaces. Python people write multi-word names with underscores: `high_score`, `player_name`, `lives_left`.

```python
player_name = "Alex"
lives_left = 3
high_score = 9000

print(player_name)
print(lives_left)
print(high_score)
```

::: tip
Good names describe what is inside. `x` and `thing` are legal but useless two weeks later. `enemy_health` tells you exactly what it is.
:::

Names are case-sensitive: `Score` and `score` are two different variables. Try printing a name you never created and read the error:

```python
score = 5
print(Score)
```

## Two kinds of numbers

Python has whole numbers (`int`) and decimal numbers (`float`). You rarely need to care which is which, but it explains some results.

```python
print(10 / 4)      # division always gives a float
print(10 // 4)     # // throws away the remainder
print(10 % 4)      # % gives only the remainder
print(2 ** 10)     # ** is "to the power of"
print(type(10))
print(type(2.5))
```

| Operator | Meaning | Example | Result |
|---|---|---|---|
| `+` | add | `7 + 2` | `9` |
| `-` | subtract | `7 - 2` | `5` |
| `*` | multiply | `7 * 2` | `14` |
| `/` | divide | `7 / 2` | `3.5` |
| `//` | divide, drop the remainder | `7 // 2` | `3` |
| `%` | remainder | `7 % 2` | `1` |
| `**` | power | `7 ** 2` | `49` |

The remainder operator `%` sounds useless until you need to know if a number is even (`n % 2` is `0` for even numbers) or how many minutes are left over after taking out whole hours.

## Math with variables

```python
minutes = 135
hours = minutes // 60
leftover = minutes % 60
print(hours)
print(leftover)
```

Python follows the normal order of operations: multiply and divide before add and subtract. Use parentheses when you want to be explicit.

```python
print(2 + 3 * 4)
print((2 + 3) * 4)
```

## Shortcuts

Changing a variable by some amount is so common that there are shortcuts.

```python
coins = 10
coins += 5     # same as coins = coins + 5
print(coins)
coins -= 3     # same as coins = coins - 3
print(coins)
coins *= 2
print(coins)
```

::: exercise id=var-swap title="Rectangle area"
Create a variable `width` with the value `12` and a variable `height` with the value `7`. Then create a variable `area` that holds width times height, and print `area`.

```python

```
--- tests
[
  {"name": "width is 12 and height is 7", "vars": [{"name": "width", "expect": "12"}, {"name": "height", "expect": "7"}]},
  {"name": "area is calculated from width and height", "vars": [{"name": "area", "expect": "84"}], "code_regex": [{"pattern": "area\\s*=.*width.*height|area\\s*=.*height.*width", "why": "Calculate area from the width and height variables, not by typing 84."}]},
  {"name": "Prints 84", "output_equals": "84"}
]
--- hints
- Three assignments and one print: width = 12, height = 7, area = width * height
--- solution
```python
width = 12
height = 7
area = width * height
print(area)
```
:::

::: exercise id=var-seconds title="Seconds in a day"
Make a variable called `seconds_per_day` that is calculated as 60 times 60 times 24, then print it. Let Python do the multiplication.

```python

```
--- tests
[
  {"name": "seconds_per_day is 86400", "vars": [{"name": "seconds_per_day", "expect": "86400"}], "code_regex": [{"pattern": "60\\s*\\*", "why": "Calculate it with multiplication (60 * 60 * 24) rather than typing the answer."}]},
  {"name": "Prints 86400", "output_equals": "86400"}
]
--- hints
- seconds_per_day = 60 * 60 * 24
--- solution
```python
seconds_per_day = 60 * 60 * 24
print(seconds_per_day)
```
:::

::: exercise id=var-change title="Level up"
The variable `level` starts at 1. Using `+=`, increase it by 1 three separate times, printing it after each increase. The output should be `2`, `3`, `4` on three lines.

```python
level = 1
# increase level by 1 and print it, three times

```
--- tests
[
  {"name": "Prints 2, 3, 4 on separate lines", "output_equals": "2\n3\n4"},
  {"name": "Uses +=", "code_regex": [{"pattern": "level\\s*\\+=", "why": "Use the += shortcut to increase level."}]},
  {"name": "level ends up as 4", "vars": [{"name": "level", "expect": "4"}]}
]
--- hints
- level += 1 then print(level). Repeat that pair three times.
--- solution
```python
level = 1
level += 1
print(level)
level += 1
print(level)
level += 1
print(level)
```
:::

::: exercise id=var-time title="Hours and minutes"
A movie is `total_minutes` long. Print how many whole hours that is, then how many minutes are left over, on two lines. For 142 minutes, the output is `2` then `22`. Use `//` and `%`. Do not change the first line: the checker tries different values.

```python
total_minutes = 142
# print the whole hours, then the leftover minutes

```
--- tests
[
  {"name": "142 minutes is 2 hours and 22 minutes", "output_equals": "2\n22"},
  {"name": "Uses // and %", "code_regex": [{"pattern": "total_minutes\\s*//\\s*60", "why": "Use total_minutes // 60 for the whole hours."}, {"pattern": "total_minutes\\s*%\\s*60", "why": "Use total_minutes % 60 for the leftover minutes."}]}
]
--- hints
- Whole hours: total_minutes // 60. Leftover: total_minutes % 60.
--- solution
```python
total_minutes = 142
print(total_minutes // 60)
print(total_minutes % 60)
```
:::

## What you learned

- `name = value` creates or updates a variable. `=` means "becomes".
- Use descriptive names with underscores.
- `/` gives decimals, `//` gives whole numbers, `%` gives the remainder, `**` is power.
- `+=`, `-=` and `*=` change a variable in place.
