---
title: Talking to the user
goal: Ask the user questions with input(), turn their answers into numbers, and build a tool someone could actually use.
---
## Asking a question

`input()` pauses the program, shows a message, and waits for the user to type something and press Enter. Whatever they typed comes back as a string, so store it in a variable.

Run this. When the box appears under the output, type your name and press Enter.

```python
name = input("What is your name? ")
print(f"Nice to meet you, {name}!")
```

The text inside `input(...)` is the **prompt**. Put a space at the end so the cursor is not jammed against the question.

## Everything from input is text

Even if the user types `12`, Python gives you the string `"12"`, not the number 12. Watch what happens:

```python
age = input("How old are you? ")
print(age + 1)
```

That crashes because you cannot add a number to a string. Turn the text into a number with `int()` (whole numbers) or `float()` (decimals):

```python
age = int(input("How old are you? "))
print(f"Next year you will be {age + 1}")
```

That line does three things from the inside out: `input()` asks, `int()` converts, `=` stores. You will write this pattern hundreds of times.

::: warning
If the user types something that is not a number, `int()` crashes with a `ValueError`. For now that is fine. Lesson 13 shows how to handle it gracefully.
:::

## A tiny calculator

```python
a = float(input("First number: "))
b = float(input("Second number: "))
print(f"{a} + {b} = {a + b}")
print(f"{a} * {b} = {a * b}")
```

## Rounding

Floats can get ugly. `round()` tidies them.

```python
price = 19.99
quantity = 3
total = price * quantity
print(total)
print(round(total, 2))
```

Inside an f-string you can also format a number with a colon: `{total:.2f}` means "2 digits after the decimal point".

```python
total = 59.970000000000006
print(f"Total: ${total:.2f}")
```

::: exercise id=in-greet title="Greeting machine"
Ask for the user's name with the prompt `Name: ` and their favorite color with the prompt `Favorite color: `. Then print one line: `Hi NAME, COLOR is a great color!` with the real values filled in.

```python

```
--- tests
[
  {"name": "Works for Sam and blue", "stdin": ["Sam", "blue"], "output_contains": "Hi Sam, blue is a great color!"},
  {"name": "Works for other answers too", "stdin": ["Maya", "orange"], "output_contains": "Hi Maya, orange is a great color!"},
  {"name": "Uses input() twice", "code_regex": [{"pattern": "input\\([^)]*\\)[\\s\\S]*input\\(", "why": "Ask two questions with two separate input() calls."}]}
]
--- hints
- name = input("Name: ") then color = input("Favorite color: ")
- Use an f-string for the final line: f"Hi {name}, {color} is a great color!"
--- solution
```python
name = input("Name: ")
color = input("Favorite color: ")
print(f"Hi {name}, {color} is a great color!")
```
:::

::: exercise id=in-double title="Doubler"
Ask the user for a whole number with the prompt `Number: ` and print `Doubled: ` followed by twice that number. For 21 the output is `Doubled: 42`.

```python

```
--- tests
[
  {"name": "21 becomes 42", "stdin": ["21"], "output_contains": "Doubled: 42"},
  {"name": "7 becomes 14", "stdin": ["7"], "output_contains": "Doubled: 14"},
  {"name": "Converts the input with int()", "code_regex": [{"pattern": "int\\(", "why": "Use int() to turn the typed text into a number."}]}
]
--- hints
- Wrap the input in int(): number = int(input("Number: "))
- Then print(f"Doubled: {number * 2}")
--- solution
```python
number = int(input("Number: "))
print(f"Doubled: {number * 2}")
```
:::

::: exercise id=in-tip title="Tip calculator"
Ask for the bill amount (prompt `Bill: `) and the tip percent (prompt `Tip percent: `). Print the tip and the total, each with 2 decimal places, like this for a bill of 50 and 20 percent:

```text
Tip: 10.00
Total: 60.00
```
```python

```
--- tests
[
  {"name": "50 with 20% tip", "stdin": ["50", "20"], "output_contains": ["Tip: 10.00", "Total: 60.00"]},
  {"name": "80 with 12.5% tip", "stdin": ["80", "12.5"], "output_contains": ["Tip: 10.00", "Total: 90.00"]},
  {"name": "Uses float()", "code_regex": [{"pattern": "float\\(", "why": "Bills can have cents, so convert with float()."}]}
]
--- hints
- tip = bill * percent / 100
- Format with 2 decimals inside an f-string: f"Tip: {tip:.2f}"
--- solution
```python
bill = float(input("Bill: "))
percent = float(input("Tip percent: "))
tip = bill * percent / 100
total = bill + tip
print(f"Tip: {tip:.2f}")
print(f"Total: {total:.2f}")
```
:::

::: exercise id=in-madlib title="Mad lib"
Ask for an adjective (prompt `Adjective: `), a noun (prompt `Noun: `) and a verb (prompt `Verb: `). Then print this sentence with the words filled in: `The ADJECTIVE NOUN decided to VERB all day.`

```python

```
--- tests
[
  {"name": "Builds the sentence", "stdin": ["sleepy", "dragon", "dance"], "output_contains": "The sleepy dragon decided to dance all day."},
  {"name": "Different words", "stdin": ["tiny", "robot", "sing"], "output_contains": "The tiny robot decided to sing all day."}
]
--- hints
- Three input() calls, then one f-string.
--- solution
```python
adjective = input("Adjective: ")
noun = input("Noun: ")
verb = input("Verb: ")
print(f"The {adjective} {noun} decided to {verb} all day.")
```
:::

## What you learned

- `input("prompt ")` asks a question and returns a string.
- `int()` and `float()` convert text to numbers. `str()` goes the other way.
- `round(x, 2)` or `{x:.2f}` tidy up decimals.
