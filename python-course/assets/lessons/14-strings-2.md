---
title: Strings, level 2
goal: Slice strings, split sentences into words and join them back, and build word games.
---
## Slicing

You already know `word[0]` picks one character. A **slice** picks a range: `word[start:stop]`, where stop is not included, exactly like `range`.

```python
word = "programming"
print(word[0:3])
print(word[3:7])
print(word[:3])      # from the start
print(word[7:])      # to the end
print(word[-3:])     # last three
```

A third number is the step. `[::-1]` means "every character, backwards", which reverses the string.

```python
word = "programming"
print(word[::2])
print(word[::-1])
```

Slicing works on lists too: `numbers[1:4]`.

## Splitting and joining

`.split()` chops a string into a list of words. `.join()` glues a list of strings back together with whatever you put in front.

```python
sentence = "the quick brown fox"
words = sentence.split()
print(words)
print(len(words))
print(" ".join(words))
print("-".join(words))
print("".join(words))
```

`.split(",")` splits on a comma instead of spaces. Useful for data like `"Ada,13,Python"`.

```python
line = "Ada,13,Python"
name, age, language = line.split(",")
print(f"{name} is {age} and likes {language}")
```

## Searching and checking

```python
text = "Python is fun. Python is powerful."
print(text.count("Python"))
print(text.find("fun"))          # position of the first match, or -1
print(text.startswith("Python"))
print(text.endswith("?"))
print("fun" in text)
```

## Checking what kind of characters

```python
print("123".isdigit())
print("abc".isalpha())
print("Hello".isupper())
print("hello".islower())
print(" ".isspace())
```

## Looping with positions

Sometimes you need both the character and where it is:

```python
word = "banana"
for i, letter in enumerate(word):
    if letter == "a":
        print(f"a at position {i}")
```

## Putting it together: Pig Latin

A classic. Move the first letter to the end and add "ay": `python` becomes `ythonpay`.

```python
word = "python"
pig = word[1:] + word[0] + "ay"
print(pig)
```

::: exercise id=str2-reverse title="Reverse a sentence's words"
Write `reverse_words(sentence)` that returns the words in reverse order. `"the quick brown fox"` becomes `"fox brown quick the"`. Do not reverse the letters, just the order of the words.

```python

```
--- tests
[
  {"name": "Four words", "calls": [{"expr": "reverse_words('the quick brown fox')", "expect": "'fox brown quick the'"}]},
  {"name": "One word", "calls": [{"expr": "reverse_words('hello')", "expect": "'hello'"}]},
  {"name": "Extra spaces are cleaned up", "calls": [{"expr": "reverse_words('  a   b  ')", "expect": "'b a'"}]},
  {"name": "Uses split and join", "code_regex": [{"pattern": "\\.split\\(", "why": "Use .split() to get the words."}, {"pattern": "\\.join\\(", "why": "Use \" \".join(...) to put them back together."}]}
]
--- hints
- words = sentence.split(), then reverse with words[::-1] or words.reverse()
- return " ".join(reversed_words)
--- solution
```python
def reverse_words(sentence):
    words = sentence.split()
    return " ".join(words[::-1])
```
:::

::: exercise id=str2-piglatin title="Pig Latin translator"
Write `pig_latin(word)` with these rules: if the word starts with a vowel (a, e, i, o, u), add `way` to the end. Otherwise move the first letter to the end and add `ay`. Assume lowercase input.

```python

```
--- tests
[
  {"name": "python", "calls": [{"expr": "pig_latin('python')", "expect": "'ythonpay'"}]},
  {"name": "apple", "calls": [{"expr": "pig_latin('apple')", "expect": "'appleway'"}]},
  {"name": "string", "calls": [{"expr": "pig_latin('string')", "expect": "'tringsay'"}]},
  {"name": "octopus", "calls": [{"expr": "pig_latin('octopus')", "expect": "'octopusway'"}]}
]
--- hints
- if word[0] in "aeiou": return word + "way"
- else: return word[1:] + word[0] + "ay"
--- solution
```python
def pig_latin(word):
    if word[0] in "aeiou":
        return word + "way"
    return word[1:] + word[0] + "ay"
```
:::

::: exercise id=str2-caesar title="Caesar cipher"
Write `encrypt(message, shift)` that shifts every lowercase letter forward in the alphabet by `shift` places, wrapping around from z to a. Leave anything that is not a lowercase letter (spaces, punctuation) unchanged. `encrypt("abc xyz", 1)` is `"bcd yza"`.

Hints: `alphabet.find(letter)` gives a letter's position, and `% 26` wraps the position around.

```python
alphabet = "abcdefghijklmnopqrstuvwxyz"

```
--- tests
[
  {"name": "Shift by 1 with wrap", "calls": [{"expr": "encrypt('abc xyz', 1)", "expect": "'bcd yza'"}]},
  {"name": "Shift by 3", "calls": [{"expr": "encrypt('hello world', 3)", "expect": "'khoor zruog'"}]},
  {"name": "Shift by 26 changes nothing", "calls": [{"expr": "encrypt('python', 26)", "expect": "'python'"}]},
  {"name": "Punctuation is kept", "calls": [{"expr": "encrypt('hi!', 2)", "expect": "'jk!'"}]},
  {"name": "Shift by 13 twice gives the original", "calls": [{"expr": "encrypt(encrypt('secret message', 13), 13)", "expect": "'secret message'"}]}
]
--- hints
- Build the result one character at a time: result = "" then result += ...
- For a letter: position = alphabet.find(letter); new_letter = alphabet[(position + shift) % 26]
- If letter not in alphabet, add it unchanged.
--- solution
```python
alphabet = "abcdefghijklmnopqrstuvwxyz"

def encrypt(message, shift):
    result = ""
    for letter in message:
        if letter in alphabet:
            position = alphabet.find(letter)
            result += alphabet[(position + shift) % 26]
        else:
            result += letter
    return result
```
:::

::: exercise id=str2-title title="Title case"
Write `title_case(sentence)` that capitalizes the first letter of every word and lowercases the rest. `"the LORD of the rings"` becomes `"The Lord Of The Rings"`. Do it with split, a loop, and join. Do not use the built-in `.title()` method.

```python

```
--- tests
[
  {"name": "Mixed case input", "calls": [{"expr": "title_case('the LORD of the rings')", "expect": "'The Lord Of The Rings'"}]},
  {"name": "Already fine", "calls": [{"expr": "title_case('Hello World')", "expect": "'Hello World'"}]},
  {"name": "All caps", "calls": [{"expr": "title_case('SHOUTING LOUDLY')", "expect": "'Shouting Loudly'"}]},
  {"name": "No .title()", "code_not_regex": [{"pattern": "\\.title\\(\\)", "why": "Do it by hand this time, without .title()."}]}
]
--- hints
- For each word: word[0].upper() + word[1:].lower(), or word.capitalize()
- Collect the fixed words in a list and " ".join them.
--- solution
```python
def title_case(sentence):
    fixed = []
    for word in sentence.split():
        fixed.append(word[0].upper() + word[1:].lower())
    return " ".join(fixed)
```
:::

::: exercise id=str2-hangman title="Hangman display"
Write `display(secret, guessed)` that returns the secret word with every letter that is *not* in the `guessed` list shown as `_`, with spaces between the characters. For `display("apple", ["a", "p"])` it returns `"a p p _ _"`.

```python

```
--- tests
[
  {"name": "apple with a and p", "calls": [{"expr": "display('apple', ['a', 'p'])", "expect": "'a p p _ _'"}]},
  {"name": "Nothing guessed", "calls": [{"expr": "display('cat', [])", "expect": "'_ _ _'"}]},
  {"name": "Everything guessed", "calls": [{"expr": "display('cat', ['c', 'a', 't'])", "expect": "'c a t'"}]},
  {"name": "Wrong guesses are ignored", "calls": [{"expr": "display('dog', ['x', 'o', 'z'])", "expect": "'_ o _'"}]}
]
--- hints
- Build a list of characters: for letter in secret, append letter if letter in guessed, else "_"
- return " ".join(that_list)
--- solution
```python
def display(secret, guessed):
    shown = []
    for letter in secret:
        if letter in guessed:
            shown.append(letter)
        else:
            shown.append("_")
    return " ".join(shown)
```
:::

::: challenge Make it a game
In the Playground, turn `display` into a full Hangman: pick a secret word, loop asking for a letter, keep a list of guesses and a count of wrong ones, and end when the word is complete or the player has 6 wrong guesses. You have every tool you need.
:::

## What you learned

- `s[start:stop:step]` slices. `s[::-1]` reverses.
- `.split()` makes a list of words; `" ".join(list)` makes a string.
- `.find()`, `.count()`, `.startswith()`, `.isdigit()` and friends answer questions about text.
