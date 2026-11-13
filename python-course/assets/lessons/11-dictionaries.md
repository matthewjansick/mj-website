---
title: Dictionaries
goal: Store data as key and value pairs, look things up by name, and count things without a hundred variables.
---
## Looking things up by name

A list finds things by position: `inventory[2]`. A **dictionary** finds things by a **key** you choose, usually a string. Curly braces, and each pair is `key: value`.

```python
player = {"name": "Ada", "health": 100, "weapon": "sword"}
print(player["name"])
print(player["health"])
```

Think of a real dictionary: you look up a word (the key) to find its meaning (the value).

## Changing and adding

Assign to a key to change it. Assign to a key that does not exist to add it.

```python
player = {"name": "Ada", "health": 100}
player["health"] -= 30
player["gold"] = 50
print(player)
```

## Missing keys

Asking for a key that is not there is an error. Run it and read the hint:

```python
player = {"name": "Ada"}
print(player["level"])
```

Two safe ways to deal with that. Check first with `in`, or use `.get()`, which returns `None` (or a default you choose) instead of crashing.

```python
player = {"name": "Ada"}
if "level" in player:
    print(player["level"])
else:
    print("no level yet")

print(player.get("level"))
print(player.get("level", 1))
```

## Removing

```python
player = {"name": "Ada", "weapon": "sword", "gold": 50}
del player["weapon"]
gold = player.pop("gold")
print(player)
print(gold)
```

## Looping over a dictionary

```python
prices = {"apple": 0.5, "bread": 2.25, "cheese": 4.0}

for item in prices:
    print(item)

for item, price in prices.items():
    print(f"{item} costs ${price:.2f}")

print(list(prices.keys()))
print(list(prices.values()))
print(len(prices))
```

## Counting with a dictionary

This pattern shows up everywhere: use each thing as a key and count how often you see it.

```python
votes = ["pizza", "tacos", "pizza", "sushi", "pizza", "tacos"]
counts = {}
for food in votes:
    if food in counts:
        counts[food] += 1
    else:
        counts[food] = 1
print(counts)
```

The `if` is there because the first time you see a food, there is nothing to add to. `.get(food, 0)` makes it shorter:

```python
votes = ["pizza", "tacos", "pizza", "sushi", "pizza", "tacos"]
counts = {}
for food in votes:
    counts[food] = counts.get(food, 0) + 1
print(counts)
```

## Dictionaries as records

A dictionary is great for one "thing" with several named properties. A list of dictionaries is great for many things. Lesson 15 goes deep on that.

```python
book = {"title": "The Hobbit", "author": "J.R.R. Tolkien", "pages": 310, "read": True}
for key, value in book.items():
    print(f"{key}: {value}")
```

::: exercise id=dict-phonebook title="Phone book"
Given the `phonebook` dictionary, ask for a name with the prompt `Name: `. If the name is in the book, print `NAME: NUMBER`. Otherwise print `NAME is not in the phone book`. Do not change the first line.

```python
phonebook = {"Ada": "555-0101", "Grace": "555-0199", "Linus": "555-0123"}

```
--- tests
[
  {"name": "Finds Grace", "stdin": ["Grace"], "last_line": "Grace: 555-0199"},
  {"name": "Finds Ada", "stdin": ["Ada"], "last_line": "Ada: 555-0101"},
  {"name": "Handles a missing name", "stdin": ["Bob"], "last_line": "Bob is not in the phone book"},
  {"name": "Checks with in or .get", "code_regex": [{"pattern": "\\bin phonebook\\b|phonebook\\.get\\(", "why": "Check whether the name exists with 'in phonebook' or .get() before looking it up."}]}
]
--- hints
- if name in phonebook: print(f"{name}: {phonebook[name]}")
--- solution
```python
phonebook = {"Ada": "555-0101", "Grace": "555-0199", "Linus": "555-0123"}
name = input("Name: ")
if name in phonebook:
    print(f"{name}: {phonebook[name]}")
else:
    print(f"{name} is not in the phone book")
```
:::

::: exercise id=dict-count title="Letter counter"
Write `count_letters(text)` that returns a dictionary mapping each letter to how many times it appears in `text`. Ignore spaces. Treat capitals as lowercase.

```python

```
--- tests
[
  {"name": "hello", "calls": [{"expr": "count_letters('hello')", "expect": "{'h': 1, 'e': 1, 'l': 2, 'o': 1}"}]},
  {"name": "Ignores spaces and capitals", "calls": [{"expr": "count_letters('A a b')", "expect": "{'a': 2, 'b': 1}"}]},
  {"name": "Empty text", "calls": [{"expr": "count_letters('')", "expect": "{}"}]},
  {"name": "Returns a dict", "calls": [{"expr": "count_letters('xyz')", "expect_type": "dict"}]}
]
--- hints
- Start with counts = {}. Loop over text.lower(). Skip if the letter is a space.
- counts[letter] = counts.get(letter, 0) + 1
--- solution
```python
def count_letters(text):
    counts = {}
    for letter in text.lower():
        if letter == " ":
            continue
        counts[letter] = counts.get(letter, 0) + 1
    return counts
```
:::

::: exercise id=dict-inventory title="Inventory manager"
`inventory` maps item names to how many you have. Keep reading commands with the prompt `> ` until the user types `quit`. Each command is a word: `add ITEM` adds one of that item (creating it if needed), `use ITEM` removes one (print `None left` if there are zero or it does not exist), and `show` prints every item as `ITEM: COUNT`, one per line. Do not change the first line.

Hint: `command.split()` turns `"add potion"` into `["add", "potion"]`.

```python
inventory = {"potion": 2}

```
--- tests
[
  {"name": "add then show", "stdin": ["add potion", "add rope", "show", "quit"], "output_contains": ["potion: 3", "rope: 1"]},
  {"name": "use works", "stdin": ["use potion", "use potion", "show", "quit"], "output_contains": ["potion: 0"]},
  {"name": "use with none left", "stdin": ["use potion", "use potion", "use potion", "quit"], "output_contains": "None left"},
  {"name": "use of unknown item", "stdin": ["use dragon", "quit"], "output_contains": "None left"}
]
--- hints
- Loop with while True, read the command, break on "quit", then parts = command.split().
- For add: inventory[item] = inventory.get(item, 0) + 1
- For use: if inventory.get(item, 0) > 0: inventory[item] -= 1 else: print("None left")
--- solution
```python
inventory = {"potion": 2}
while True:
    command = input("> ")
    if command == "quit":
        break
    parts = command.split()
    action = parts[0]
    if action == "add":
        item = parts[1]
        inventory[item] = inventory.get(item, 0) + 1
    elif action == "use":
        item = parts[1]
        if inventory.get(item, 0) > 0:
            inventory[item] -= 1
        else:
            print("None left")
    elif action == "show":
        for item, count in inventory.items():
            print(f"{item}: {count}")
```
:::

::: exercise id=dict-top title="Most common"
Write `most_common(items)` that takes a list and returns the item that appears most often. If the list is empty, return `None`. Assume there is no tie.

```python

```
--- tests
[
  {"name": "pizza wins", "calls": [{"expr": "most_common(['pizza', 'tacos', 'pizza', 'sushi', 'pizza'])", "expect": "'pizza'"}]},
  {"name": "numbers work too", "calls": [{"expr": "most_common([3, 1, 3, 2, 1, 1])", "expect": "1"}]},
  {"name": "empty list gives None", "calls": [{"expr": "most_common([])", "expect": "None"}]}
]
--- hints
- Count with a dictionary first. Then loop over counts.items() keeping the best so far.
- Keep two variables: best_item = None and best_count = 0
--- solution
```python
def most_common(items):
    counts = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1
    best_item = None
    best_count = 0
    for item, count in counts.items():
        if count > best_count:
            best_item = item
            best_count = count
    return best_item
```
:::

## What you learned

- `{key: value}` makes a dictionary. `d[key]` reads, `d[key] = v` writes.
- `in` and `.get(key, default)` avoid crashes on missing keys.
- `.items()` loops over pairs. Counting with `.get(x, 0) + 1` is a pattern to memorize.
