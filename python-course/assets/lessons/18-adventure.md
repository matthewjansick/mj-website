---
title: Build a text adventure
goal: Combine everything into a complete game with rooms, items, a player, and a save system. Then make it yours.
---
## The plan

A text adventure is a game where the player types commands like `go north` or `take key` and the game describes what happens. It is the perfect final project because it uses everything: dictionaries for rooms, lists for inventory, loops for the game, functions for each command, classes for the player, and JSON for saving.

You will build it in five parts. Each part is an exercise that checks a piece. At the end you will have a working game, and then you will make it your own.

::: goal
By the end: a game with at least 4 rooms, items you can pick up, a locked door that needs a key, and a win condition.
:::

## Part 1: the map

Rooms are dictionaries. Each has a description and a dictionary of exits mapping a direction to another room's name. Here is a tiny version:

```python
rooms = {
    "hall": {
        "description": "A dusty hall. Doors lead north and east.",
        "exits": {"north": "library", "east": "kitchen"},
        "items": ["lamp"],
    },
    "library": {
        "description": "Shelves of old books. The hall is south.",
        "exits": {"south": "hall"},
        "items": ["key"],
    },
    "kitchen": {
        "description": "Smells of bread. The hall is west.",
        "exits": {"west": "hall"},
        "items": [],
    },
}

def describe(room_name):
    room = rooms[room_name]
    print(room["description"])
    if room["items"]:
        print("You see: " + ", ".join(room["items"]))
    print("Exits: " + ", ".join(room["exits"].keys()))

describe("hall")
```

::: exercise id=adv-map title="Part 1: a bigger map"
Build a `rooms` dictionary with **at least 4 rooms**. Every room needs `description`, `exits` and `items` keys. Every exit must point to a room that exists, and every room must be reachable: for each exit from room A to room B, room B should have an exit back to A in the opposite direction (north/south, east/west, up/down). Include a room called `start` where the player begins.

```python
rooms = {
    "start": {
        "description": "",
        "exits": {},
        "items": [],
    },
}

```
--- tests
[
  {"name": "At least 4 rooms including start", "calls": [{"expr": "len(rooms) >= 4 and 'start' in rooms", "expect": "True"}]},
  {"name": "Every room has description, exits and items", "calls": [{"expr": "all(set(r.keys()) >= {'description', 'exits', 'items'} and isinstance(r['exits'], dict) and isinstance(r['items'], list) and len(r['description']) > 5 for r in rooms.values())", "expect": "True"}]},
  {"name": "Every exit leads to a real room", "calls": [{"expr": "all(target in rooms for r in rooms.values() for target in r['exits'].values())", "expect": "True"}]},
  {"name": "Exits go both ways", "calls": [{"expr": "all(rooms[target]['exits'].get({'north':'south','south':'north','east':'west','west':'east','up':'down','down':'up'}.get(d)) == name for name, r in rooms.items() for d, target in r['exits'].items())", "expect": "True"}]},
  {"name": "start has at least one exit", "calls": [{"expr": "len(rooms['start']['exits']) >= 1", "expect": "True"}]}
]
--- hints
- Copy the pattern from the example. Give each room a name, then fill in exits like {"north": "garden"}.
- If start goes north to garden, garden must go south to start.
--- solution
```python
rooms = {
    "start": {
        "description": "A cold stone cell. The door to the north is open.",
        "exits": {"north": "corridor"},
        "items": ["torch"],
    },
    "corridor": {
        "description": "A long corridor. Your cell is south, a guard room east, stairs go up.",
        "exits": {"south": "start", "east": "guardroom", "up": "tower"},
        "items": [],
    },
    "guardroom": {
        "description": "A snoring guard. A key glints on the table. The corridor is west.",
        "exits": {"west": "corridor"},
        "items": ["key"],
    },
    "tower": {
        "description": "The top of the tower. A locked gate leads to freedom. Stairs go down.",
        "exits": {"down": "corridor"},
        "items": [],
    },
}
```
:::

## Part 2: the player

The player has a location and an inventory, plus actions. That is a class.

::: exercise id=adv-player title="Part 2: the Player class"
Write a class `Player` with `__init__(self, location)` that sets `self.location` and `self.inventory = []`. Add:

- `has(item)` returns True if the item is in the inventory
- `take(item)` adds the item to the inventory
- `drop(item)` removes it if present and returns True, otherwise returns False

```python

```
--- tests
[
  {"name": "Starts in the given room with nothing", "calls": [{"expr": "Player('start').location", "expect": "'start'"}, {"expr": "Player('start').inventory", "expect": "[]"}]},
  {"name": "take and has", "calls": [{"expr": "(lambda p: (p.take('key'), p.has('key'), p.has('sword'))[1:])(Player('start'))", "expect": "(True, False)"}]},
  {"name": "drop", "calls": [{"expr": "(lambda p: (p.take('key'), p.drop('key'), p.has('key'), p.drop('key'))[1:])(Player('start'))", "expect": "(True, False, False)"}]}
]
--- hints
- has: return item in self.inventory
- drop: if item in self.inventory: remove it and return True. Else return False.
--- solution
```python
class Player:
    def __init__(self, location):
        self.location = location
        self.inventory = []

    def has(self, item):
        return item in self.inventory

    def take(self, item):
        self.inventory.append(item)

    def drop(self, item):
        if item in self.inventory:
            self.inventory.remove(item)
            return True
        return False
```
:::

## Part 3: commands as functions

Each command the player can type becomes a function that takes the player, the rooms, and the rest of the command. Keeping them separate makes it easy to add new commands later.

```python
def go(player, rooms, direction):
    exits = rooms[player.location]["exits"]
    if direction in exits:
        player.location = exits[direction]
        return True
    print("You can't go that way.")
    return False
```

::: exercise id=adv-commands title="Part 3: go, take and drop"
Write three functions. Each takes `player` and `rooms` first.

- `go(player, rooms, direction)`: if the direction is an exit of the current room, move the player and return `True`. Otherwise print `You can't go that way.` and return `False`.
- `take(player, rooms, item)`: if the item is in the current room's `items`, remove it from the room, add it to the player's inventory, print `Taken: ITEM` and return `True`. Otherwise print `There is no ITEM here.` and return `False`.
- `drop(player, rooms, item)`: if the player has the item, remove it from the inventory, add it to the room's items, print `Dropped: ITEM` and return `True`. Otherwise print `You don't have ITEM.` and return `False`.

The checker provides its own `Player` class and a `rooms` dictionary called `R`, so you only need the three functions here.

```python

```
--- setup
```python
class Player:
    def __init__(self, location):
        self.location = location
        self.inventory = []
    def has(self, item):
        return item in self.inventory

R = {
    "a": {"description": "Room A", "exits": {"north": "b"}, "items": ["lamp"]},
    "b": {"description": "Room B", "exits": {"south": "a"}, "items": []},
}
```
--- tests
[
  {"name": "go to a valid exit", "calls": [{"expr": "(lambda p: (go(p, R, 'north'), p.location))(Player('a'))", "expect": "(True, 'b')"}]},
  {"name": "go to an invalid exit", "calls": [{"expr": "(lambda p: (go(p, R, 'west'), p.location))(Player('a'))", "expect": "(False, 'a')", "prints": "You can't go that way."}]},
  {"name": "take an item that is here", "calls": [{"expr": "(lambda p: (take(p, R, 'lamp'), p.inventory, R['a']['items']))(Player('a'))", "expect": "(True, ['lamp'], [])", "prints": "Taken: lamp"}]},
  {"name": "take an item that is not here", "calls": [{"expr": "(lambda p: (take(p, R, 'sword'), p.inventory))(Player('a'))", "expect": "(False, [])", "prints": "There is no sword here."}]},
  {"name": "drop an item you have", "calls": [{"expr": "(lambda p: (p.inventory.append('rope'), drop(p, R, 'rope'), p.inventory, R['a']['items'])[1:])(Player('a'))", "expect": "(True, [], ['lamp', 'rope'])", "prints": "Dropped: rope"}]},
  {"name": "drop an item you do not have", "calls": [{"expr": "drop(Player('a'), R, 'gem')", "expect": "False", "prints": "You don't have gem."}]}
]
--- hints
- Current room: room = rooms[player.location]
- take: if item in room["items"]: room["items"].remove(item); player.inventory.append(item)
--- solution
```python
def go(player, rooms, direction):
    exits = rooms[player.location]["exits"]
    if direction in exits:
        player.location = exits[direction]
        return True
    print("You can't go that way.")
    return False

def take(player, rooms, item):
    room = rooms[player.location]
    if item in room["items"]:
        room["items"].remove(item)
        player.inventory.append(item)
        print(f"Taken: {item}")
        return True
    print(f"There is no {item} here.")
    return False

def drop(player, rooms, item):
    if item in player.inventory:
        player.inventory.remove(item)
        rooms[player.location]["items"].append(item)
        print(f"Dropped: {item}")
        return True
    print(f"You don't have {item}.")
    return False
```
:::

## Part 4: the game loop

The loop reads a command, splits it into a verb and the rest, and calls the right function. Unknown commands get a polite message.

```python
def parse(command):
    """Split 'go north' into ('go', 'north'). Returns ('', '') for empty input."""
    parts = command.strip().lower().split(maxsplit=1)
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]

print(parse("go north"))
print(parse("TAKE  rusty key"))
print(parse("look"))
print(parse(""))
```

::: exercise id=adv-loop title="Part 4: the game loop"
Write `play(player, rooms)`. It loops forever doing this:

1. Print the current room's description, then `Items here: a, b` if there are any, then `Exits: north, east` (exits in the order they appear in the dictionary).
2. Read a command with the prompt `> ` and split it into verb and rest (lowercase, extra spaces removed).
3. `go DIRECTION`, `take ITEM`, `drop ITEM` call the matching function.
4. `inventory` prints `You carry: a, b` or `You carry nothing.`
5. `quit` prints `Goodbye!` and returns.
6. Anything else prints `I don't understand.`

The checker provides `Player`, `go`, `take`, `drop` and a function `make_rooms()` that builds the hall, library and kitchen from the lesson. Write only `play` (and a `parse` helper if you like).

```python

```
--- setup
```python
class Player:
    def __init__(self, location):
        self.location = location
        self.inventory = []
    def has(self, item):
        return item in self.inventory

def go(player, rooms, direction):
    exits = rooms[player.location]["exits"]
    if direction in exits:
        player.location = exits[direction]
        return True
    print("You can't go that way.")
    return False

def take(player, rooms, item):
    room = rooms[player.location]
    if item in room["items"]:
        room["items"].remove(item)
        player.inventory.append(item)
        print(f"Taken: {item}")
        return True
    print(f"There is no {item} here.")
    return False

def drop(player, rooms, item):
    if item in player.inventory:
        player.inventory.remove(item)
        rooms[player.location]["items"].append(item)
        print(f"Dropped: {item}")
        return True
    print(f"You don't have {item}.")
    return False

def make_rooms():
    return {
        "hall": {"description": "A dusty hall.", "exits": {"north": "library", "east": "kitchen"}, "items": ["lamp"]},
        "library": {"description": "Old books.", "exits": {"south": "hall"}, "items": ["key"]},
        "kitchen": {"description": "Smells of bread.", "exits": {"west": "hall"}, "items": []},
    }
```
--- tests
[
  {"name": "Describes the room and quits", "calls": [{"expr": "play(Player('hall'), make_rooms())", "stdin": ["quit"], "prints": "A dusty hall.\nItems here: lamp\nExits: north, east\n> quit\nGoodbye!"}]},
  {"name": "Moves between rooms", "calls": [{"expr": "(lambda p: (play(p, make_rooms()), p.location)[1])(Player('hall'))", "stdin": ["go north", "quit"], "expect": "'library'", "prints_contains": "Old books."}]},
  {"name": "Takes items and shows inventory", "calls": [{"expr": "play(Player('hall'), make_rooms())", "stdin": ["take lamp", "inventory", "quit"], "prints_contains": "You carry: lamp"}]},
  {"name": "Empty inventory message", "calls": [{"expr": "play(Player('hall'), make_rooms())", "stdin": ["inventory", "quit"], "prints_contains": "You carry nothing."}]},
  {"name": "Unknown command", "calls": [{"expr": "play(Player('hall'), make_rooms())", "stdin": ["dance", "quit"], "prints_contains": "I don't understand."}]},
  {"name": "Case and spaces do not matter", "calls": [{"expr": "(lambda p: (play(p, make_rooms()), p.location)[1])(Player('hall'))", "stdin": ["  GO   East ", "quit"], "expect": "'kitchen'"}]},
  {"name": "Kitchen has no items line", "calls": [{"expr": "play(Player('kitchen'), make_rooms())", "stdin": ["quit"], "prints": "Smells of bread.\nExits: west\n> quit\nGoodbye!"}]},
  {"name": "Drop puts the item in the room", "calls": [{"expr": "play(Player('hall'), make_rooms())", "stdin": ["take lamp", "go east", "drop lamp", "quit"], "prints_contains": "Dropped: lamp"}]}
]
--- hints
- Use the parse function from the lesson to get verb and rest.
- A while True loop. For "quit": print("Goodbye!") then return.
- Items line: if room["items"]: print("Items here: " + ", ".join(room["items"]))
--- solution
```python
def parse(command):
    parts = command.strip().lower().split(maxsplit=1)
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]

def play(player, rooms):
    while True:
        room = rooms[player.location]
        print(room["description"])
        if room["items"]:
            print("Items here: " + ", ".join(room["items"]))
        print("Exits: " + ", ".join(room["exits"].keys()))
        verb, rest = parse(input("> "))
        if verb == "quit":
            print("Goodbye!")
            return
        elif verb == "go":
            go(player, rooms, rest)
        elif verb == "take":
            take(player, rooms, rest)
        elif verb == "drop":
            drop(player, rooms, rest)
        elif verb == "inventory":
            if player.inventory:
                print("You carry: " + ", ".join(player.inventory))
            else:
                print("You carry nothing.")
        else:
            print("I don't understand.")
```
:::

## Part 5: winning

A game needs a goal. The classic: a locked exit that opens only if you carry the key. Add a `locked` key to a room's data, and check it inside `go`.

```python
rooms = {
    "tower": {
        "description": "The top of the tower. A locked gate.",
        "exits": {"down": "corridor", "north": "freedom"},
        "items": [],
        "locked": {"north": "key"},
    },
    "freedom": {"description": "You are free!", "exits": {}, "items": []},
    "corridor": {"description": "A corridor.", "exits": {"up": "tower"}, "items": ["key"]},
}

class Player:
    def __init__(self, location):
        self.location = location
        self.inventory = []
    def has(self, item):
        return item in self.inventory

def go(player, rooms, direction):
    room = rooms[player.location]
    if direction not in room["exits"]:
        print("You can't go that way.")
        return False
    needed = room.get("locked", {}).get(direction)
    if needed and not player.has(needed):
        print(f"It's locked. You need the {needed}.")
        return False
    player.location = room["exits"][direction]
    return True

p = Player("tower")
go(p, rooms, "north")
p.inventory.append("key")
go(p, rooms, "north")
print(p.location)
```

::: exercise id=adv-win title="Part 5: locked doors and winning"
Write a new `go(player, rooms, direction)` that handles locked exits exactly like the example: a room may have a `locked` dictionary mapping a direction to the item needed. If the player lacks it, print `It's locked. You need the ITEM.` and return `False`. Rooms without a `locked` key work normally.

Then write `check_win(player, rooms)` that returns `True` if the player's current room has `"win": True` in its data, otherwise `False`.

The checker provides `Player` and a map called `R` with a tower, a corridor and a winning room called freedom.

```python

```
--- setup
```python
class Player:
    def __init__(self, location):
        self.location = location
        self.inventory = []
    def has(self, item):
        return item in self.inventory

R = {
    "tower": {"description": "The top of the tower.", "exits": {"down": "corridor", "north": "freedom"}, "items": [], "locked": {"north": "key"}},
    "freedom": {"description": "You are free!", "exits": {}, "items": [], "win": True},
    "corridor": {"description": "A corridor.", "exits": {"up": "tower"}, "items": ["key"]},
}
```
--- tests
[
  {"name": "Locked without the key", "calls": [{"expr": "(lambda p: (go(p, R, 'north'), p.location))(Player('tower'))", "expect": "(False, 'tower')", "prints": "It's locked. You need the key."}]},
  {"name": "Opens with the key", "calls": [{"expr": "(lambda p: (p.inventory.append('key'), go(p, R, 'north'), p.location)[1:])(Player('tower'))", "expect": "(True, 'freedom')"}]},
  {"name": "Unlocked exits still work", "calls": [{"expr": "(lambda p: (go(p, R, 'down'), p.location))(Player('tower'))", "expect": "(True, 'corridor')"}]},
  {"name": "Rooms without a locked key work", "calls": [{"expr": "(lambda p: (go(p, R, 'up'), p.location))(Player('corridor'))", "expect": "(True, 'tower')"}]},
  {"name": "Invalid direction", "calls": [{"expr": "go(Player('corridor'), R, 'west')", "expect": "False", "prints": "You can't go that way."}]},
  {"name": "check_win", "calls": [{"expr": "check_win(Player('freedom'), R)", "expect": "True"}, {"expr": "check_win(Player('tower'), R)", "expect": "False"}]}
]
--- hints
- needed = room.get("locked", {}).get(direction) gives None when there is no lock.
- check_win: return rooms[player.location].get("win", False)
--- solution
```python
def go(player, rooms, direction):
    room = rooms[player.location]
    if direction not in room["exits"]:
        print("You can't go that way.")
        return False
    needed = room.get("locked", {}).get(direction)
    if needed and not player.has(needed):
        print(f"It's locked. You need the {needed}.")
        return False
    player.location = room["exits"][direction]
    return True

def check_win(player, rooms):
    return rooms[player.location].get("win", False)
```
:::

## Part 6: assemble it

Open the **Playground** and paste together your pieces: the `rooms` from Part 1 (add a `locked` exit and a `win` room), the `Player` class, `go`, `take`, `drop`, `parse` and `play`. In `play`, after each command, call `check_win` and if it returns True print a victory message and return. Add a `save` command using `json.dump` of the player's location and inventory, and a `load` command that restores them.

Then make it yours. Ideas, roughly in order of difficulty:

- A `look` command that re-describes the room, and `help` that lists commands.
- Items that do something: a `use torch` command that reveals a hidden exit in a dark room.
- A health value and a monster in one room that takes HP each turn until you leave or fight.
- Random events with `random.random() < 0.2`.
- Loading the whole map from a JSON file so you can write new adventures without touching the code.
- A `Room` class instead of dictionaries, with methods like `describe()`.

::: challenge Show someone
When it works, have a family member play it while you watch. Every time they type something your game does not understand, that is your next feature.
:::

## What you learned

Everything. Variables, strings, input, decisions, loops, lists, functions, dictionaries, randomness, error handling, classes, and files, working together in one real program that you designed. That is programming.

Where next: install Python on a real computer (python.org), try the `turtle` module for drawing, or look at `pygame` for 2D games. The ideas are the same; only the toolbox changes.
