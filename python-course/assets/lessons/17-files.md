---
title: Saving data
goal: Write to files, read them back, and store structured data as JSON so programs remember things.
---
## Programs forget everything

When a program ends, every variable disappears. To remember something between runs, you save it to a **file**. In this browser version of Python, files live in a temporary in-memory folder that is wiped when you reload the page, but the code is exactly what you would write on a real computer.

## Writing a file

```python
with open("notes.txt", "w") as f:
    f.write("First line\n")
    f.write("Second line\n")
print("Saved!")
```

- `open(filename, mode)` opens a file. Mode `"w"` means **write** (it creates the file, or wipes it if it exists).
- `with ... as f:` gives you the file as `f` and **closes it automatically** when the indented block ends. Always use `with`.
- `.write()` does not add a newline. You add `\n` yourself.

## Reading a file

Mode `"r"` means read. Run the writing example above first, then this:

```python
with open("notes.txt", "r") as f:
    contents = f.read()
print(contents)
```

Or line by line, which is better for big files:

```python
with open("notes.txt") as f:
    for line in f:
        print(line.strip())
```

`.strip()` removes the `\n` at the end of each line. Mode `"r"` is the default, so you can leave it out.

## Appending

Mode `"a"` adds to the end instead of wiping the file. Good for logs and high-score lists.

```python
with open("log.txt", "a") as f:
    f.write("Player logged in\n")
with open("log.txt", "a") as f:
    f.write("Player won a game\n")
with open("log.txt") as f:
    print(f.read())
```

## When the file is missing

Opening a file that does not exist for reading raises `FileNotFoundError`. Catch it to give a sensible default.

```python
try:
    with open("scores.txt") as f:
        scores = f.read().split()
except FileNotFoundError:
    scores = []
print(scores)
```

## JSON: saving real data

Writing lists and dictionaries by hand is painful. **JSON** is a text format that looks almost exactly like Python dictionaries and lists, and the `json` module converts both ways in one line.

```python
import json

save = {"name": "Ada", "level": 5, "items": ["sword", "potion"], "alive": True}

with open("save.json", "w") as f:
    json.dump(save, f)

with open("save.json") as f:
    loaded = json.load(f)

print(loaded)
print(loaded["items"][1])
print(type(loaded))
```

`json.dump(data, file)` writes, `json.load(file)` reads. There are also `json.dumps(data)` and `json.loads(text)`, with an s for **string**, which convert to and from text without files.

```python
import json
text = json.dumps({"a": 1, "b": [1, 2, 3]}, indent=2)
print(text)
print(json.loads(text)["b"])
```

::: note
JSON is the language of the internet. Almost every website and app sends data as JSON. You now speak it.
:::

::: exercise id=file-write title="Write and read back"
Write the three words from `words` to a file called `words.txt`, one per line. Then open the file again, read it, and print each line in uppercase.

```python
words = ["apple", "banana", "cherry"]

```
--- tests
[
  {"name": "Prints the words in uppercase", "output_equals": "APPLE\nBANANA\nCHERRY"},
  {"name": "The file exists with the right contents", "calls": [{"expr": "open('words.txt').read().split()", "expect": "['apple', 'banana', 'cherry']"}]},
  {"name": "Uses with open", "code_regex": [{"pattern": "with open\\(", "why": "Open files with 'with open(...) as f:'."}]}
]
--- hints
- with open("words.txt", "w") as f: for word in words: f.write(word + "\n")
- Then with open("words.txt") as f: for line in f: print(line.strip().upper())
--- solution
```python
words = ["apple", "banana", "cherry"]
with open("words.txt", "w") as f:
    for word in words:
        f.write(word + "\n")
with open("words.txt") as f:
    for line in f:
        print(line.strip().upper())
```
:::

::: exercise id=file-count title="Count lines and words"
Write `file_stats(filename)` that returns a tuple `(lines, words)`: the number of lines and the number of words in the file. Assume the file exists.

```python

```
--- tests
[
  {"name": "Two lines, five words", "calls": [{"expr": "(lambda: (open('t1.txt', 'w').write('the quick brown\\nfox jumps\\n'), file_stats('t1.txt'))[1])()", "expect": "(2, 5)"}]},
  {"name": "Empty file", "calls": [{"expr": "(lambda: (open('t2.txt', 'w').write(''), file_stats('t2.txt'))[1])()", "expect": "(0, 0)"}]},
  {"name": "One line without a newline", "calls": [{"expr": "(lambda: (open('t3.txt', 'w').write('hello world'), file_stats('t3.txt'))[1])()", "expect": "(1, 2)"}]}
]
--- hints
- Read everything with f.read(), then text.splitlines() gives the lines and text.split() gives the words.
--- solution
```python
def file_stats(filename):
    with open(filename) as f:
        text = f.read()
    return len(text.splitlines()), len(text.split())
```
:::

::: exercise id=file-highscore title="High score file"
Write `save_score(name, score)` that appends a line `NAME,SCORE` to `scores.txt`, and `best_score()` that reads the file and returns a tuple `(name, score)` for the highest score, with the score as an int. If the file does not exist, `best_score()` returns `None`.

```python

```
--- tests
[
  {"name": "No file yet gives None", "calls": [{"expr": "(lambda: (__import__('os').path.exists('scores.txt') and __import__('os').remove('scores.txt'), best_score())[1])()", "expect": "None"}]},
  {"name": "Saves and finds the best", "calls": [{"expr": "(save_score('Ada', 50), save_score('Bob', 120), save_score('Cy', 80), best_score())[3]", "expect": "('Bob', 120)"}]},
  {"name": "Appends rather than overwrites", "calls": [{"expr": "(save_score('Dee', 1), len(open('scores.txt').read().splitlines()))[1]", "expect": "4"}]},
  {"name": "Handles FileNotFoundError", "code_regex": [{"pattern": "except\\s+FileNotFoundError", "why": "Catch FileNotFoundError in best_score."}]}
]
--- hints
- save_score: with open("scores.txt", "a") as f: f.write(f"{name},{score}\n")
- best_score: loop over lines, split(","), int the score, keep the best. Wrap the open in try/except FileNotFoundError.
--- solution
```python
def save_score(name, score):
    with open("scores.txt", "a") as f:
        f.write(f"{name},{score}\n")

def best_score():
    try:
        with open("scores.txt") as f:
            lines = f.read().splitlines()
    except FileNotFoundError:
        return None
    best = None
    for line in lines:
        name, score = line.split(",")
        score = int(score)
        if best is None or score > best[1]:
            best = (name, score)
    return best
```
:::

::: exercise id=file-json title="Save game with JSON"
Write `save_game(state)` that writes the dictionary `state` to `save.json` using `json.dump`, and `load_game()` that reads it back with `json.load`. If there is no save file, `load_game()` returns a fresh state: `{"level": 1, "hp": 100, "items": []}`.

```python
import json

```
--- tests
[
  {"name": "Fresh state when no file", "calls": [{"expr": "(lambda: (__import__('os').path.exists('save.json') and __import__('os').remove('save.json'), load_game())[1])()", "expect": "{'level': 1, 'hp': 100, 'items': []}"}]},
  {"name": "Round trip", "calls": [{"expr": "(save_game({'level': 7, 'hp': 42, 'items': ['key', 'map']}), load_game())[1]", "expect": "{'level': 7, 'hp': 42, 'items': ['key', 'map']}"}]},
  {"name": "Uses json.dump and json.load", "code_regex": [{"pattern": "json\\.dump\\(", "why": "Use json.dump(state, f) to write."}, {"pattern": "json\\.load\\(", "why": "Use json.load(f) to read."}]}
]
--- hints
- save: with open("save.json", "w") as f: json.dump(state, f)
- load: try to open and json.load; except FileNotFoundError return the fresh dictionary.
--- solution
```python
import json

def save_game(state):
    with open("save.json", "w") as f:
        json.dump(state, f)

def load_game():
    try:
        with open("save.json") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"level": 1, "hp": 100, "items": []}
```
:::

## What you learned

- `with open(name, mode) as f:` opens a file and closes it for you. Modes: `"r"` read, `"w"` write, `"a"` append.
- `f.read()`, `f.write()`, and `for line in f`.
- `json.dump` / `json.load` save and restore lists and dictionaries.
- Catch `FileNotFoundError` for the first run.
