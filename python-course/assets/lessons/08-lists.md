---
title: Lists
goal: Keep many values in one variable, add and remove items, and loop over them.
---
## One variable, many values

A **list** holds a sequence of values in square brackets, separated by commas.

```python
inventory = ["sword", "shield", "potion"]
print(inventory)
print(len(inventory))
```

Items have positions starting at 0, just like characters in a string.

```python
inventory = ["sword", "shield", "potion"]
print(inventory[0])
print(inventory[2])
print(inventory[-1])
```

Lists can hold numbers, strings, booleans, even other lists. Usually one list holds one kind of thing.

```python
scores = [88, 92, 79, 95]
print(max(scores))
print(min(scores))
print(sum(scores))
print(sum(scores) / len(scores))
```

## Changing a list

Unlike strings, lists can be changed in place.

```python
inventory = ["sword", "shield"]
inventory.append("potion")        # add to the end
print(inventory)
inventory.insert(0, "map")        # insert at a position
print(inventory)
inventory.remove("shield")        # remove by value
print(inventory)
last = inventory.pop()            # remove and return the last item
print(last)
print(inventory)
inventory[0] = "compass"          # replace by position
print(inventory)
```

## Looping over a list

```python
todo = ["feed cat", "do homework", "learn Python"]
for task in todo:
    print(f"- {task}")
```

If you also need the position, use `enumerate`:

```python
todo = ["feed cat", "do homework", "learn Python"]
for i, task in enumerate(todo, start=1):
    print(f"{i}. {task}")
```

## Checking and finding

```python
colors = ["red", "green", "blue"]
print("green" in colors)
print("purple" in colors)
print(colors.index("blue"))
print(colors.count("red"))
```

## Sorting

```python
numbers = [5, 2, 9, 1]
numbers.sort()
print(numbers)
numbers.sort(reverse=True)
print(numbers)

names = ["Zoe", "adam", "Maya"]
print(sorted(names))
print(sorted(names, key=str.lower))
```

`.sort()` changes the list. `sorted()` gives you a new sorted copy and leaves the original alone.

## Building a list in a loop

Start empty and `append` as you go. This is the list version of the accumulator pattern.

```python
squares = []
for n in range(1, 6):
    squares.append(n * n)
print(squares)
```

::: warning
`my_list = my_list.append(x)` is a trap. `append` changes the list and returns `None`, so that line throws your list away. Just write `my_list.append(x)`.
:::

::: exercise id=list-build title="Shopping list"
Keep asking the user for items with the prompt `Item: ` until they type `done`. Then print `You need N items:` (with the real count) followed by each item on its own line with a dash in front.

```text
Item: eggs
Item: milk
Item: done
You need 2 items:
- eggs
- milk
```
```python
items = []

```
--- tests
[
  {"name": "Two items", "stdin": ["eggs", "milk", "done"], "output_contains": ["You need 2 items:", "- eggs", "- milk"]},
  {"name": "Zero items", "stdin": ["done"], "output_contains": "You need 0 items:"},
  {"name": "Uses append", "code_regex": [{"pattern": "\\.append\\(", "why": "Add each item to the list with .append()."}]},
  {"name": "done is not added to the list", "stdin": ["bread", "done"], "output_not_contains": "- done"}
]
--- hints
- while True: item = input("Item: "); if item == "done": break; items.append(item)
- After the loop: print(f"You need {len(items)} items:") then loop and print each with "- ".
--- solution
```python
items = []
while True:
    item = input("Item: ")
    if item == "done":
        break
    items.append(item)
print(f"You need {len(items)} items:")
for item in items:
    print(f"- {item}")
```
:::

::: exercise id=list-stats title="Score report"
Given the list `scores`, print three lines: `Highest: `, `Lowest: ` and `Average: ` with the right numbers. The average should be rounded to 1 decimal place. Do not change the first line; the checker uses it as is.

```python
scores = [72, 95, 88, 64, 91]

```
--- tests
[
  {"name": "Correct report", "output_contains": ["Highest: 95", "Lowest: 64", "Average: 82.0"]},
  {"name": "Uses max, min and sum", "code_regex": [{"pattern": "max\\(", "why": "Use max() for the highest."}, {"pattern": "min\\(", "why": "Use min() for the lowest."}, {"pattern": "sum\\(", "why": "Use sum() and len() for the average."}]}
]
--- hints
- Average is sum(scores) / len(scores). Round with round(x, 1) or {x:.1f}.
--- solution
```python
scores = [72, 95, 88, 64, 91]
print(f"Highest: {max(scores)}")
print(f"Lowest: {min(scores)}")
print(f"Average: {sum(scores) / len(scores):.1f}")
```
:::

::: exercise id=list-evens title="Filter the evens"
Build a new list called `evens` that contains only the even numbers from `numbers`, in the same order. Then print `evens`. Do not change the first line.

```python
numbers = [3, 8, 15, 22, 7, 10, 41, 6]
evens = []

```
--- tests
[
  {"name": "evens is [8, 22, 10, 6]", "vars": [{"name": "evens", "expect": "[8, 22, 10, 6]"}]},
  {"name": "Prints the list", "last_line": "[8, 22, 10, 6]"},
  {"name": "Uses a loop and append", "code_regex": [{"pattern": "^\\s*for\\b", "why": "Loop over numbers."}, {"pattern": "evens\\.append\\(", "why": "Append the even ones to evens."}]}
]
--- hints
- for n in numbers: if n % 2 == 0: evens.append(n)
--- solution
```python
numbers = [3, 8, 15, 22, 7, 10, 41, 6]
evens = []
for n in numbers:
    if n % 2 == 0:
        evens.append(n)
print(evens)
```
:::

::: exercise id=list-leaderboard title="Leaderboard"
Sort `players` alphabetically (ignoring capitals) and print them as a numbered list starting at 1, like `1. adam`. Do not change the first line.

```python
players = ["Zoe", "adam", "Maya", "Ben"]

```
--- tests
[
  {"name": "Sorted and numbered", "output_equals": "1. adam\n2. Ben\n3. Maya\n4. Zoe"},
  {"name": "Uses enumerate or a counter", "code_regex": [{"pattern": "enumerate\\(|range\\(", "why": "Use enumerate(..., start=1) or a counter to number the lines."}]}
]
--- hints
- sorted(players, key=str.lower) sorts without caring about capitals.
- for i, name in enumerate(sorted_list, start=1): print(f"{i}. {name}")
--- solution
```python
players = ["Zoe", "adam", "Maya", "Ben"]
for i, name in enumerate(sorted(players, key=str.lower), start=1):
    print(f"{i}. {name}")
```
:::

::: exercise id=list-longest title="Longest word"
Find the longest word in `words` and print it. If there is a tie, print the first one. Do it with a loop, not with `max`. Do not change the first line.

```python
words = ["cat", "elephant", "dog", "crocodile", "ant"]

```
--- tests
[
  {"name": "Prints crocodile", "last_line": "crocodile"},
  {"name": "Uses a loop, not max()", "code_regex": [{"pattern": "^\\s*for\\b", "why": "Use a for loop to compare the lengths."}], "code_not_regex": [{"pattern": "\\bmax\\(", "why": "Try it without max() this time. Keep track of the longest word so far."}]}
]
--- hints
- Keep a variable longest = "" and compare: if len(word) > len(longest): longest = word
--- solution
```python
words = ["cat", "elephant", "dog", "crocodile", "ant"]
longest = ""
for word in words:
    if len(word) > len(longest):
        longest = word
print(longest)
```
:::

## What you learned

- `[a, b, c]` makes a list. Positions start at 0.
- `.append()`, `.insert()`, `.remove()`, `.pop()` change a list. `len()`, `sum()`, `max()`, `min()` measure it.
- `for item in my_list:` visits each item. `enumerate()` gives positions too.
- `.sort()` sorts in place; `sorted()` returns a sorted copy.
