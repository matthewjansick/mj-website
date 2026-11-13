---
title: Strings
goal: Join text together, measure it, change its case, and build sentences with f-strings.
---
## Text is a string

A **string** is any text in quotes. Single quotes and double quotes both work. Pick one and be consistent; double quotes are the most common.

```python
animal = "octopus"
sound = 'blub'
print(animal)
print(sound)
```

If your text contains a quote, use the other kind of quote around it:

```python
print("It's a trap!")
print('She said "run"')
```

## Joining strings

The `+` sign glues strings together. This is called **concatenation**. Python does not add spaces for you.

```python
first = "Ada"
last = "Lovelace"
print(first + last)
print(first + " " + last)
```

You can repeat a string with `*`:

```python
print("ha" * 5)
print("-" * 30)
```

## Numbers and strings do not mix

This is the most common error in beginner Python. Run it and read the hint:

```python
age = 13
print("I am " + age + " years old")
```

Python refuses to glue a number to text. You have two fixes. The first is `str()`, which turns a number into a string:

```python
age = 13
print("I am " + str(age) + " years old")
```

The second fix is much nicer, and it is what most Python programmers use.

## f-strings

Put an `f` before the opening quote, and you can drop variables into the text inside curly braces `{ }`.

```python
name = "Ada"
age = 13
print(f"My name is {name} and I am {age} years old")
print(f"Next year I will be {age + 1}")
```

Anything inside the braces is evaluated as Python. Math, variables, even function calls.

## Useful things strings can do

Strings come with built-in **methods**: actions you call with a dot.

```python
word = "Python"
print(len(word))          # len() counts characters
print(word.upper())
print(word.lower())
print(word.replace("P", "J"))
print("   spaces   ".strip())
print("hello".capitalize())
```

Methods do not change the original. They give you a new string back.

```python
word = "quiet"
word.upper()
print(word)          # still quiet
word = word.upper()  # to keep the change, store it
print(word)
```

## Picking out characters

Each character has a position, called an **index**. Counting starts at **0**, not 1. Negative numbers count from the end.

```python
word = "Python"
print(word[0])
print(word[1])
print(word[-1])
print(word[5])
```

Try `word[6]` and read the error. There is no position 6 in a 6-letter word, because the positions are 0 to 5.

## Special characters

Inside a string, `\n` means "new line" and `\t` means "tab".

```python
print("Line one\nLine two")
print("Name:\tAda")
```

::: exercise id=str-fullname title="Full name"
Make `first` and `last` variables holding any names you like, then print them on one line with a space in between, using `+`.

```python
first = "Grace"
last = "Hopper"

```
--- tests
[
  {"name": "Prints first and last name with a space", "output_regex": "^\\S+ \\S+$", "why": "Print exactly one line: the first name, a space, then the last name."},
  {"name": "Uses + to join them", "code_regex": [{"pattern": "first\\s*\\+|\\+\\s*last", "why": "Join the variables with +."}]}
]
--- hints
- Three things to join: first, a string containing one space, and last.
- print(first + " " + last)
--- solution
```python
first = "Grace"
last = "Hopper"
print(first + " " + last)
```
:::

::: exercise id=str-fstring title="Pet report"
Using one f-string, print `My pet Rex is 4 years old` from the variables. Do not type the values into the string by hand. Then, on a second line, print how old Rex is in dog years (multiply by 7) using another f-string: `In dog years that is 28`.

```python
pet = "Rex"
age = 4

```
--- tests
[
  {"name": "First line uses the variables", "output_contains": "My pet Rex is 4 years old"},
  {"name": "Second line does the math", "output_contains": "In dog years that is 28"},
  {"name": "Uses f-strings", "code_regex": [{"pattern": "f\"|f'", "why": "Use an f-string: f\"...{pet}...\""}, {"pattern": "\\{\\s*age\\s*\\*\\s*7\\s*\\}|\\{\\s*7\\s*\\*\\s*age\\s*\\}", "why": "Do the dog-years math inside the braces: {age * 7}."}]}
]
--- hints
- f"My pet {pet} is {age} years old"
- Math works inside braces: {age * 7}
--- solution
```python
pet = "Rex"
age = 4
print(f"My pet {pet} is {age} years old")
print(f"In dog years that is {age * 7}")
```
:::

::: exercise id=str-shout title="Shout and count"
Given the variable `phrase`, print it in UPPERCASE on the first line, then print how many characters it has on the second line.

```python
phrase = "python is fun"

```
--- tests
[
  {"name": "First line is uppercase", "output_contains": "PYTHON IS FUN"},
  {"name": "Second line is the length (13)", "last_line": "13"},
  {"name": "Uses .upper() and len()", "code_regex": [{"pattern": "\\.upper\\(\\)", "why": "Use the .upper() method."}, {"pattern": "len\\(", "why": "Use len() to count the characters."}]}
]
--- hints
- phrase.upper() gives the uppercase version. len(phrase) gives the count.
--- solution
```python
phrase = "python is fun"
print(phrase.upper())
print(len(phrase))
```
:::

::: exercise id=str-initials title="Initials"
Print the initials of the person: the first character of `first` and the first character of `last`, joined with no space. For Grace Hopper that is `GH`. Use indexing with `[0]`.

```python
first = "Grace"
last = "Hopper"

```
--- tests
[
  {"name": "Prints GH", "output_equals": "GH"},
  {"name": "Uses indexing", "code_regex": [{"pattern": "first\\[0\\]", "why": "Use first[0] to get the first character."}, {"pattern": "last\\[0\\]", "why": "Use last[0] to get the first character of the last name."}]}
]
--- hints
- first[0] is "G". Join it to last[0] with +, or put both in an f-string.
--- solution
```python
first = "Grace"
last = "Hopper"
print(first[0] + last[0])
```
:::

::: exercise id=str-banner title="Banner"
Print a banner: a line of 20 equals signs, then the `title` in uppercase, then another line of 20 equals signs. Use `*` to make the equals lines.

```python
title = "game over"

```
--- tests
[
  {"name": "Prints the banner", "output_equals": "====================\nGAME OVER\n===================="},
  {"name": "Uses string multiplication", "code_regex": [{"pattern": "\"=\"\\s*\\*\\s*20|'='\\s*\\*\\s*20|20\\s*\\*\\s*\"=\"|20\\s*\\*\\s*'='", "why": "Make the line with \"=\" * 20 instead of typing 20 equals signs."}]}
]
--- hints
- "=" * 20 makes the line. Print it, then the title in uppercase, then the line again.
--- solution
```python
title = "game over"
print("=" * 20)
print(title.upper())
print("=" * 20)
```
:::

## What you learned

- `+` joins strings. `*` repeats them.
- You cannot add a number to a string. Use an f-string: `f"Score: {score}"`.
- `len()` measures. `.upper()`, `.lower()`, `.replace()`, `.strip()` transform.
- Characters have positions starting at 0. `word[-1]` is the last one.
