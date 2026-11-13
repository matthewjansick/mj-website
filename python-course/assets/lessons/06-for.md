---
title: Repeating with for
goal: Use for loops and range() to repeat code, count, and add things up without copying and pasting.
---
## Repeating yourself is a bug

Suppose you want to print "Hip hip hooray" three times. You could write three prints. Now imagine 500 times. A **loop** repeats a block of code for you.

```python
for i in range(3):
    print("Hip hip hooray")
```

Read it as: "for each number `i` in the range 0 to 2, do the indented block". Same rules as `if`: a colon at the end, and the repeated lines are indented.

## range() counts for you

`range(n)` produces the numbers from 0 up to **but not including** n. The loop variable (`i` here) takes each value in turn.

```python
for i in range(5):
    print(i)
```

The variable can be named anything. Use a name that says what it is when it matters:

```python
for number in range(1, 6):
    print(f"{number} squared is {number ** 2}")
```

`range(1, 6)` starts at 1 and stops before 6. A third number sets the step:

```python
for n in range(0, 21, 5):
    print(n)

for countdown in range(10, 0, -1):
    print(countdown)
print("Liftoff!")
```

## Looping over a string

A `for` loop can walk through anything that is a sequence, including the characters of a string.

```python
for letter in "Python":
    print(letter)
```

## Adding things up

A very common pattern: start a variable at 0, then add to it inside the loop. This is called an **accumulator**.

```python
total = 0
for n in range(1, 11):
    total += n
print(f"1 + 2 + ... + 10 = {total}")
```

Trace it in your head: total is 0, then 1, then 3, then 6, then 10... Running the loop in your head is the skill that makes loops click.

## Loops and if together

Anything can go inside a loop, including an `if`.

```python
for n in range(1, 21):
    if n % 2 == 0:
        print(f"{n} is even")
```

Notice the double indentation. The `if` is inside the `for`, so the `print` is indented twice.

::: tip
Printing the loop variable is the fastest way to understand what a loop is doing. When confused, add `print(i)` and look.
:::

::: exercise id=for-count title="Count to ten"
Print the numbers 1 to 10, one per line, using a `for` loop and `range()`.

```python

```
--- tests
[
  {"name": "Prints 1 to 10", "output_equals": "1\n2\n3\n4\n5\n6\n7\n8\n9\n10"},
  {"name": "Uses a for loop with range", "code_regex": [{"pattern": "^\\s*for\\b.*\\brange\\(", "why": "Use for ... in range(...)."}]}
]
--- hints
- range(1, 11) gives 1 through 10. The stop number is not included.
--- solution
```python
for n in range(1, 11):
    print(n)
```
:::

::: exercise id=for-table title="Times table"
Ask for a number with the prompt `Number: ` and print its times table from 1 to 10, one line each, in the format `7 x 1 = 7`.

```python

```
--- tests
[
  {"name": "Table for 7", "stdin": ["7"], "output_contains": ["7 x 1 = 7", "7 x 5 = 35", "7 x 10 = 70"]},
  {"name": "Table for 12, last line", "stdin": ["12"], "last_line": "12 x 10 = 120"},
  {"name": "Uses a loop", "code_regex": [{"pattern": "^\\s*for\\b", "why": "Use a for loop, not ten print lines."}]}
]
--- hints
- for i in range(1, 11): then print(f"{number} x {i} = {number * i}")
--- solution
```python
number = int(input("Number: "))
for i in range(1, 11):
    print(f"{number} x {i} = {number * i}")
```
:::

::: exercise id=for-sum title="Sum of evens"
Add up all the even numbers from 2 to 100 (2 + 4 + 6 + ... + 100) and print the total. Use an accumulator variable called `total`.

```python
total = 0

```
--- tests
[
  {"name": "total is 2550", "vars": [{"name": "total", "expect": "2550"}]},
  {"name": "Prints 2550", "last_line": "2550"},
  {"name": "Uses a loop and +=", "code_regex": [{"pattern": "^\\s*for\\b", "why": "Use a for loop."}, {"pattern": "total\\s*\\+=|total\\s*=\\s*total\\s*\\+", "why": "Add each number to total inside the loop."}]}
]
--- hints
- Either range(2, 101, 2) to step by 2, or range(1, 101) with an if n % 2 == 0.
--- solution
```python
total = 0
for n in range(2, 101, 2):
    total += n
print(total)
```
:::

::: exercise id=for-stars title="Staircase"
Print a staircase of stars with 5 steps, like this. Hint: `"*" * n` makes a row of n stars.

```text
*
**
***
****
*****
```
```python

```
--- tests
[
  {"name": "Prints the staircase", "output_equals": "*\n**\n***\n****\n*****"},
  {"name": "Uses a loop", "code_regex": [{"pattern": "^\\s*for\\b", "why": "Use a for loop."}]}
]
--- hints
- for n in range(1, 6): print("*" * n)
--- solution
```python
for n in range(1, 6):
    print("*" * n)
```
:::

::: exercise id=for-vowels title="Vowel counter"
Ask for a word (prompt `Word: `) and count how many vowels (a, e, i, o, u) it contains. Print `Vowels: ` followed by the count. Treat capitals the same as lowercase.

```python

```
--- tests
[
  {"name": "banana has 3", "stdin": ["banana"], "last_line": "Vowels: 3"},
  {"name": "rhythm has 0", "stdin": ["rhythm"], "last_line": "Vowels: 0"},
  {"name": "AEIOU has 5", "stdin": ["AEIOU"], "last_line": "Vowels: 5"},
  {"name": "Loops over the word", "code_regex": [{"pattern": "^\\s*for\\b", "why": "Loop over each letter with a for loop."}]}
]
--- hints
- Loop over each letter: for letter in word.lower():
- Inside: if letter in "aeiou": count += 1
--- solution
```python
word = input("Word: ")
count = 0
for letter in word.lower():
    if letter in "aeiou":
        count += 1
print(f"Vowels: {count}")
```
:::

## What you learned

- `for x in range(n):` repeats n times. `range(start, stop, step)` controls the counting.
- A loop can walk through a string one character at a time.
- Accumulators start at 0 and grow inside the loop.
