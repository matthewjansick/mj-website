---
title: Nested data
goal: Combine lists and dictionaries to model real things, sort them, and build a tiny database.
---
## Lists of dictionaries

One dictionary describes one thing. A list of dictionaries describes many. This is how almost every app stores its data.

```python
students = [
    {"name": "Ada", "grade": 92, "house": "red"},
    {"name": "Linus", "grade": 78, "house": "blue"},
    {"name": "Grace", "grade": 88, "house": "red"},
]

print(students[0])
print(students[0]["name"])
print(len(students))

for student in students:
    print(f"{student['name']}: {student['grade']}")
```

Inside an f-string, use single quotes for the key so they do not clash with the double quotes around the string.

## Filtering

Build a new list containing only the records that match.

```python
students = [
    {"name": "Ada", "grade": 92, "house": "red"},
    {"name": "Linus", "grade": 78, "house": "blue"},
    {"name": "Grace", "grade": 88, "house": "red"},
]

red_house = []
for student in students:
    if student["house"] == "red":
        red_house.append(student["name"])
print(red_house)
```

## Sorting by a field

`sorted()` can take a `key` function that says what to sort by. The tidiest way to write that function is a one-line `lambda`.

```python
students = [
    {"name": "Ada", "grade": 92},
    {"name": "Linus", "grade": 78},
    {"name": "Grace", "grade": 88},
]

by_grade = sorted(students, key=lambda s: s["grade"], reverse=True)
for s in by_grade:
    print(f"{s['name']}: {s['grade']}")
```

`lambda s: s["grade"]` means "a tiny function that takes `s` and gives back `s["grade"]`". You could write it as a normal `def` too.

## Dictionaries of lists

Keys that map to lists are perfect for grouping.

```python
teams = {
    "red": ["Ada", "Grace"],
    "blue": ["Linus"],
}
teams["blue"].append("Maya")
teams["green"] = []
for team, members in teams.items():
    print(f"{team}: {', '.join(members) if members else '(empty)'}")
```

## Dictionaries inside dictionaries

```python
game = {
    "player": {"name": "Ada", "hp": 80, "items": ["sword", "potion"]},
    "level": 3,
}
print(game["player"]["name"])
print(game["player"]["items"][0])
game["player"]["hp"] -= 10
print(game["player"]["hp"])
```

Read a chain like `game["player"]["items"][0]` left to right: the game, then its player, then the player's items, then the first item.

## List comprehensions

A shortcut for "build a list by looping". Optional, but you will see it everywhere.

```python
numbers = [1, 2, 3, 4, 5, 6]
squares = [n * n for n in numbers]
evens = [n for n in numbers if n % 2 == 0]
print(squares)
print(evens)

names = [s["name"] for s in [{"name": "Ada"}, {"name": "Linus"}]]
print(names)
```

::: exercise id=nest-top title="Top student"
Write `top_student(students)` that returns the **name** of the student with the highest grade. `students` is a list of dictionaries with `name` and `grade` keys.

```python

```
--- tests
[
  {"name": "Finds Ada", "calls": [{"expr": "top_student([{'name': 'Ada', 'grade': 92}, {'name': 'Linus', 'grade': 78}, {'name': 'Grace', 'grade': 88}])", "expect": "'Ada'"}]},
  {"name": "Works when the best is last", "calls": [{"expr": "top_student([{'name': 'A', 'grade': 1}, {'name': 'B', 'grade': 2}, {'name': 'C', 'grade': 3}])", "expect": "'C'"}]},
  {"name": "One student", "calls": [{"expr": "top_student([{'name': 'Solo', 'grade': 50}])", "expect": "'Solo'"}]}
]
--- hints
- Keep best = students[0] and loop comparing student["grade"] > best["grade"].
- Or use max(students, key=lambda s: s["grade"])["name"]
--- solution
```python
def top_student(students):
    best = students[0]
    for student in students:
        if student["grade"] > best["grade"]:
            best = student
    return best["name"]
```
:::

::: exercise id=nest-average title="Average by house"
Write `house_averages(students)` that returns a dictionary mapping each house to the average grade of its students. Students have `name`, `grade` and `house` keys. For the three students in the lesson, the result is `{'red': 90.0, 'blue': 78.0}`.

```python

```
--- tests
[
  {"name": "Two houses", "calls": [{"expr": "house_averages([{'name': 'Ada', 'grade': 92, 'house': 'red'}, {'name': 'Linus', 'grade': 78, 'house': 'blue'}, {'name': 'Grace', 'grade': 88, 'house': 'red'}])", "expect": "{'red': 90.0, 'blue': 78.0}"}]},
  {"name": "One house, three students", "calls": [{"expr": "house_averages([{'name': 'A', 'grade': 10, 'house': 'x'}, {'name': 'B', 'grade': 20, 'house': 'x'}, {'name': 'C', 'grade': 30, 'house': 'x'}])", "expect": "{'x': 20.0}"}]},
  {"name": "Empty list", "calls": [{"expr": "house_averages([])", "expect": "{}"}]}
]
--- hints
- First group grades by house into a dict of lists: grades[house].append(grade). Use .get or check 'in' for the first time you see a house.
- Then build the result: averages[house] = sum(list) / len(list)
--- solution
```python
def house_averages(students):
    grades = {}
    for student in students:
        house = student["house"]
        if house not in grades:
            grades[house] = []
        grades[house].append(student["grade"])
    averages = {}
    for house, values in grades.items():
        averages[house] = sum(values) / len(values)
    return averages
```
:::

::: exercise id=nest-sort title="Leaderboard, sorted"
Write `leaderboard(players)` that **prints** the players sorted by score from highest to lowest, numbered from 1, in the format `1. Ada - 92`. `players` is a list of dicts with `name` and `score`.

```python

```
--- tests
[
  {"name": "Three players", "calls": [{"expr": "leaderboard([{'name': 'Linus', 'score': 78}, {'name': 'Ada', 'score': 92}, {'name': 'Grace', 'score': 88}])", "prints": "1. Ada - 92\n2. Grace - 88\n3. Linus - 78"}]},
  {"name": "Does not change the original list", "calls": [{"expr": "(lambda p: (leaderboard(p), p[0]['name'])[1])([{'name': 'Low', 'score': 1}, {'name': 'High', 'score': 9}])", "expect": "'Low'"}]},
  {"name": "Uses sorted with a key", "code_regex": [{"pattern": "sorted\\([^)]*key\\s*=", "why": "Use sorted(players, key=...) so the original list is not changed."}]}
]
--- hints
- ordered = sorted(players, key=lambda p: p["score"], reverse=True)
- for i, p in enumerate(ordered, start=1): print(f"{i}. {p['name']} - {p['score']}")
--- solution
```python
def leaderboard(players):
    ordered = sorted(players, key=lambda p: p["score"], reverse=True)
    for i, p in enumerate(ordered, start=1):
        print(f"{i}. {p['name']} - {p['score']}")
```
:::

::: exercise id=nest-db title="Tiny contact database"
Build a contacts program. Start with an empty list. Read commands with the prompt `> ` until `quit`:

- `add NAME PHONE` adds a dictionary with `name` and `phone` keys
- `find NAME` prints `NAME: PHONE` or `Not found`
- `list` prints every contact as `NAME: PHONE`, sorted by name

```python
contacts = []

```
--- tests
[
  {"name": "add and find", "stdin": ["add Ada 555-0101", "find Ada", "quit"], "output_contains": "Ada: 555-0101"},
  {"name": "find missing", "stdin": ["find Bob", "quit"], "output_contains": "Not found"},
  {"name": "list is sorted by name", "stdin": ["add Zoe 1", "add Ada 2", "add Max 3", "list", "quit"], "output_regex": "Ada: 2\\nMax: 3\\nZoe: 1", "why": "list should print contacts sorted by name, one per line."},
  {"name": "Stores dictionaries", "stdin": ["add Ada 555", "quit"], "calls": [{"expr": "contacts[0]['name']", "expect": "'Ada'"}, {"expr": "contacts[0]['phone']", "expect": "'555'"}]}
]
--- hints
- parts = command.split(). parts[0] is the action.
- For add: contacts.append({"name": parts[1], "phone": parts[2]})
- For list: for c in sorted(contacts, key=lambda c: c["name"]):
--- solution
```python
contacts = []
while True:
    command = input("> ")
    if command == "quit":
        break
    parts = command.split()
    if parts[0] == "add":
        contacts.append({"name": parts[1], "phone": parts[2]})
    elif parts[0] == "find":
        found = False
        for c in contacts:
            if c["name"] == parts[1]:
                print(f"{c['name']}: {c['phone']}")
                found = True
        if not found:
            print("Not found")
    elif parts[0] == "list":
        for c in sorted(contacts, key=lambda c: c["name"]):
            print(f"{c['name']}: {c['phone']}")
```
:::

## What you learned

- A list of dictionaries is the standard shape for "many records".
- `sorted(items, key=lambda x: x["field"])` sorts by a field.
- Chains like `data["a"]["b"][0]` read left to right.
- `[expr for x in items if cond]` builds a list in one line.
