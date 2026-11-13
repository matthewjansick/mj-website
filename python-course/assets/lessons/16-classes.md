---
title: Classes and objects
goal: Define your own kinds of things that bundle data with the actions that belong to it.
---
## Why classes?

A dictionary can describe a player: `{"name": "Ada", "hp": 100}`. But the *actions* a player can do (take damage, heal, attack) end up as loose functions you have to remember to call correctly. A **class** packages the data and the actions together.

You have been using classes all along. `"hello"` is a `str` object with methods like `.upper()`. `[1, 2]` is a `list` object with `.append()`. Now you make your own.

## Defining a class

```python
class Player:
    def __init__(self, name, hp):
        self.name = name
        self.hp = hp

    def take_damage(self, amount):
        self.hp -= amount
        print(f"{self.name} takes {amount} damage. HP: {self.hp}")

ada = Player("Ada", 100)
ada.take_damage(30)
print(ada.hp)
```

Piece by piece:

- `class Player:` starts the definition. Class names are Capitalized by convention.
- `__init__` is a special method that runs when you create a new Player. It sets up the object's data.
- `self` is the object itself. Every method gets it as the first parameter, automatically. `self.name` is "this player's name".
- `ada = Player("Ada", 100)` creates an **object** (also called an **instance**). Python calls `__init__` for you with `self` set to the new object.
- `ada.take_damage(30)` calls the method on that object. You do not pass `self`; Python does.

## Many objects from one class

```python
class Player:
    def __init__(self, name, hp):
        self.name = name
        self.hp = hp

    def is_alive(self):
        return self.hp > 0

ada = Player("Ada", 100)
bob = Player("Bob", 0)
print(ada.name, ada.is_alive())
print(bob.name, bob.is_alive())
```

Each object has its own data. Changing `ada.hp` does nothing to `bob.hp`.

## Methods that use other methods

```python
class Counter:
    def __init__(self):
        self.count = 0

    def click(self):
        self.count += 1

    def click_many(self, times):
        for i in range(times):
            self.click()

    def reset(self):
        self.count = 0

c = Counter()
c.click()
c.click_many(5)
print(c.count)
c.reset()
print(c.count)
```

## Printing an object nicely

Printing an object shows something ugly by default. Define `__str__` to say what printing should show.

```python
class Player:
    def __init__(self, name, hp):
        self.name = name
        self.hp = hp

    def __str__(self):
        return f"{self.name} ({self.hp} HP)"

ada = Player("Ada", 100)
print(ada)
```

## Objects holding objects

```python
class Item:
    def __init__(self, name, value):
        self.name = name
        self.value = value

class Backpack:
    def __init__(self):
        self.items = []

    def add(self, item):
        self.items.append(item)

    def total_value(self):
        total = 0
        for item in self.items:
            total += item.value
        return total

pack = Backpack()
pack.add(Item("gem", 50))
pack.add(Item("rope", 5))
print(pack.total_value())
```

::: tip
If you are unsure whether something should be a class, ask: does it have both data *and* things it does? A dog has a name and can bark: class. A list of scores is just data: list.
:::

::: exercise id=cls-dog title="A Dog class"
Write a class `Dog` with an `__init__` that takes `name` and `age` and stores them. Add a method `speak()` that returns `"NAME says woof!"` and a method `birthday()` that adds 1 to the age.

```python

```
--- tests
[
  {"name": "Stores name and age", "calls": [{"expr": "Dog('Rex', 3).name", "expect": "'Rex'"}, {"expr": "Dog('Rex', 3).age", "expect": "3"}]},
  {"name": "speak()", "calls": [{"expr": "Dog('Rex', 3).speak()", "expect": "'Rex says woof!'"}]},
  {"name": "birthday()", "calls": [{"expr": "(lambda d: (d.birthday(), d.age)[1])(Dog('Luna', 7))", "expect": "8"}]},
  {"name": "Uses class, __init__ and self", "code_regex": [{"pattern": "^class Dog", "why": "Define class Dog:"}, {"pattern": "def __init__\\(self", "why": "Define __init__(self, name, age)."}]}
]
--- hints
- def __init__(self, name, age): self.name = name; self.age = age
- def speak(self): return f"{self.name} says woof!"
--- solution
```python
class Dog:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def speak(self):
        return f"{self.name} says woof!"

    def birthday(self):
        self.age += 1
```
:::

::: exercise id=cls-account title="Bank account"
Write a class `Account` with `__init__(self, owner, balance=0)`. Add `deposit(amount)` which adds to the balance, and `withdraw(amount)` which subtracts it **only if** there is enough money and returns `True`, or returns `False` without changing anything if there is not.

```python

```
--- tests
[
  {"name": "Starts at 0 by default", "calls": [{"expr": "Account('Ada').balance", "expect": "0"}]},
  {"name": "deposit", "calls": [{"expr": "(lambda a: (a.deposit(50), a.balance)[1])(Account('Ada', 10))", "expect": "60"}]},
  {"name": "withdraw with enough money", "calls": [{"expr": "(lambda a: (a.withdraw(30), a.balance))(Account('Ada', 100))", "expect": "(True, 70)"}]},
  {"name": "withdraw with too little money", "calls": [{"expr": "(lambda a: (a.withdraw(300), a.balance))(Account('Ada', 100))", "expect": "(False, 100)"}]},
  {"name": "Exact amount is allowed", "calls": [{"expr": "(lambda a: (a.withdraw(100), a.balance))(Account('Ada', 100))", "expect": "(True, 0)"}]}
]
--- hints
- In withdraw: if amount > self.balance: return False. Otherwise subtract and return True.
--- solution
```python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount

    def withdraw(self, amount):
        if amount > self.balance:
            return False
        self.balance -= amount
        return True
```
:::

::: exercise id=cls-rect title="Rectangle with __str__"
Write a class `Rectangle` with `width` and `height`. Add methods `area()` and `perimeter()`, and a `__str__` that returns `"Rectangle 3x4"` for a 3 by 4 rectangle.

```python

```
--- tests
[
  {"name": "area", "calls": [{"expr": "Rectangle(3, 4).area()", "expect": "12"}]},
  {"name": "perimeter", "calls": [{"expr": "Rectangle(3, 4).perimeter()", "expect": "14"}]},
  {"name": "str()", "calls": [{"expr": "str(Rectangle(3, 4))", "expect": "'Rectangle 3x4'"}, {"expr": "str(Rectangle(10, 2))", "expect": "'Rectangle 10x2'"}]},
  {"name": "Defines __str__", "code_regex": [{"pattern": "def __str__\\(self\\)", "why": "Define __str__(self)."}]}
]
--- hints
- perimeter is 2 * (width + height)
- def __str__(self): return f"Rectangle {self.width}x{self.height}"
--- solution
```python
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

    def perimeter(self):
        return 2 * (self.width + self.height)

    def __str__(self):
        return f"Rectangle {self.width}x{self.height}"
```
:::

::: exercise id=cls-deck title="A deck of cards"
Write a class `Deck`. When created it holds 52 cards in `self.cards`: every combination of the ranks `2` to `10`, `J`, `Q`, `K`, `A` and the suits `hearts`, `diamonds`, `clubs`, `spades`, as strings like `"A of spades"`. Add `shuffle()` which uses `random.shuffle` on the cards, and `draw()` which removes and returns the top card (the last one in the list). Drawing from an empty deck returns `None`.

```python
import random

```
--- tests
[
  {"name": "52 cards", "calls": [{"expr": "len(Deck().cards)", "expect": "52"}]},
  {"name": "Cards are named correctly", "calls": [{"expr": "'A of spades' in Deck().cards", "expect": "True"}, {"expr": "'10 of hearts' in Deck().cards", "expect": "True"}, {"expr": "len(set(Deck().cards))", "expect": "52"}]},
  {"name": "draw removes a card", "calls": [{"expr": "(lambda d: (d.draw() in Deck().cards, len(d.cards)))(Deck())", "expect": "(True, 51)"}]},
  {"name": "Empty deck draws None", "calls": [{"expr": "(lambda d: ([d.draw() for _ in range(52)], d.draw())[1])(Deck())", "expect": "None"}]},
  {"name": "shuffle changes the order", "seed": 1, "calls": [{"expr": "(lambda d: (d.shuffle(), d.cards != Deck().cards, sorted(d.cards) == sorted(Deck().cards))[1:])(Deck())", "expect": "(True, True)"}]}
]
--- hints
- Two nested loops in __init__: for suit in suits: for rank in ranks: self.cards.append(f"{rank} of {suit}")
- draw: if not self.cards: return None, else return self.cards.pop()
--- solution
```python
import random

class Deck:
    def __init__(self):
        ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
        suits = ["hearts", "diamonds", "clubs", "spades"]
        self.cards = []
        for suit in suits:
            for rank in ranks:
                self.cards.append(f"{rank} of {suit}")

    def shuffle(self):
        random.shuffle(self.cards)

    def draw(self):
        if not self.cards:
            return None
        return self.cards.pop()
```
:::

## What you learned

- `class Name:` defines a type. `__init__(self, ...)` sets up each new object.
- `self.x` is data that belongs to this object. Methods are functions that take `self`.
- `Name(...)` creates an object. `obj.method()` calls a method on it.
- `__str__` controls what `print(obj)` shows.
