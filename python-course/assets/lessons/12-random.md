---
title: Randomness and modules
goal: Import modules to get extra powers, make games unpredictable with random, and use math.
---
## Modules are toolboxes

Python comes with hundreds of **modules**: files full of ready-made functions. You bring one in with `import`, then use its functions with a dot.

```python
import random

print(random.randint(1, 6))
print(random.randint(1, 6))
print(random.randint(1, 6))
```

`random.randint(a, b)` gives a whole number from a to b, **including both ends**. Run it a few times.

## Useful random functions

```python
import random

print(random.random())                     # a decimal from 0 up to (not including) 1
print(random.choice(["rock", "paper", "scissors"]))
print(random.choice("abcdef"))

cards = ["A", "K", "Q", "J", "10"]
random.shuffle(cards)                      # mixes the list in place
print(cards)

print(random.sample(range(1, 50), 6))      # 6 different lottery numbers
```

## Making the guessing game random

```python
import random

secret = random.randint(1, 20)
tries = 0
while True:
    guess = int(input("Guess (1-20): "))
    tries += 1
    if guess < secret:
        print("Higher!")
    elif guess > secret:
        print("Lower!")
    else:
        print(f"Got it in {tries}!")
        break
```

::: note
When the checker tests random programs, it sets a **seed** first so the "random" numbers come out the same every time. You can do that yourself with `random.seed(42)` to make bugs repeatable.
:::

## The math module

```python
import math

print(math.sqrt(144))
print(math.pi)
print(math.floor(3.7))
print(math.ceil(3.2))
print(math.gcd(12, 18))
```

## Importing just what you need

```python
from random import randint, choice
from math import sqrt

print(randint(1, 100))
print(choice(["heads", "tails"]))
print(sqrt(2))
```

Both styles are fine. `import random` keeps it obvious where `randint` came from; `from random import randint` is shorter.

## Simulations

Randomness lets you answer questions by trying things many times. How often do two dice add up to 7?

```python
import random

sevens = 0
rolls = 10000
for i in range(rolls):
    total = random.randint(1, 6) + random.randint(1, 6)
    if total == 7:
        sevens += 1
print(f"{sevens / rolls * 100:.1f}% of rolls were 7")
```

::: exercise id=rand-dice title="Roll the dice"
Write `roll(sides)` that returns a random whole number from 1 to `sides`. Then roll a 20-sided die 5 times and print each result.

```python
import random

```
--- tests
[
  {"name": "roll(6) stays between 1 and 6", "seed": 3, "calls": [{"expr": "all(1 <= roll(6) <= 6 for _ in range(200))", "expect": "True"}]},
  {"name": "roll(20) can reach 1 and 20", "seed": 7, "calls": [{"expr": "sorted({roll(20) for _ in range(1000)})[0]", "expect": "1"}, {"expr": "sorted({roll(20) for _ in range(1000)})[-1]", "expect": "20"}]},
  {"name": "Prints five numbers", "seed": 1, "output_regex": "^\\d+\\n\\d+\\n\\d+\\n\\d+\\n\\d+$", "why": "Print exactly five rolls, one number per line."},
  {"name": "Uses randint", "code_regex": [{"pattern": "randint\\(", "why": "Use random.randint(1, sides)."}]}
]
--- hints
- return random.randint(1, sides)
- for i in range(5): print(roll(20))
--- solution
```python
import random

def roll(sides):
    return random.randint(1, sides)

for i in range(5):
    print(roll(20))
```
:::

::: exercise id=rand-rps title="Rock, paper, scissors"
Ask the player for `rock`, `paper` or `scissors` with the prompt `Your move: `. The computer picks randomly with `random.choice`. Print `Computer: ` and its move, then `You win!`, `You lose!` or `Tie!`. Rock beats scissors, scissors beats paper, paper beats rock.

```python
import random

```
--- tests
[
  {"name": "Shows the computer's move", "seed": 1, "stdin": ["rock"], "output_regex": "Computer: (rock|paper|scissors)", "why": "Print 'Computer: ' followed by its move."},
  {"name": "Ends with a result", "seed": 2, "stdin": ["paper"], "output_regex": "(You win!|You lose!|Tie!)$", "why": "The last line should be You win!, You lose! or Tie!"},
  {"name": "Logic check: same move is a tie", "seed": 1, "stdin": ["rock"], "code_regex": [{"pattern": "Tie!", "why": "Handle the tie case."}, {"pattern": "random\\.choice\\(|\\bchoice\\(", "why": "Use random.choice for the computer's move."}]},
  {"name": "Result matches the moves", "seed": 5, "stdin": ["scissors"], "output_regex": "(Computer: scissors[\\s\\S]*Tie!|Computer: rock[\\s\\S]*You lose!|Computer: paper[\\s\\S]*You win!)", "why": "Check your win/lose logic: scissors beats paper, loses to rock."}
]
--- hints
- moves = ["rock", "paper", "scissors"]; computer = random.choice(moves)
- Tie if they are equal. You win if (player, computer) is one of (rock, scissors), (scissors, paper), (paper, rock). Otherwise you lose.
--- solution
```python
import random

moves = ["rock", "paper", "scissors"]
player = input("Your move: ").lower()
computer = random.choice(moves)
print(f"Computer: {computer}")
if player == computer:
    print("Tie!")
elif (player == "rock" and computer == "scissors") or (player == "scissors" and computer == "paper") or (player == "paper" and computer == "rock"):
    print("You win!")
else:
    print("You lose!")
```
:::

::: exercise id=rand-password title="Password generator"
Write `make_password(length)` that returns a random string of that length, using letters and digits from the `characters` string. Then print one password of length 12.

```python
import random

characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

```
--- tests
[
  {"name": "Right length", "seed": 1, "calls": [{"expr": "len(make_password(12))", "expect": "12"}, {"expr": "len(make_password(4))", "expect": "4"}]},
  {"name": "Only uses allowed characters", "seed": 2, "calls": [{"expr": "all(c in characters for c in make_password(50))", "expect": "True"}]},
  {"name": "Different each time", "seed": 3, "calls": [{"expr": "make_password(10) != make_password(10)", "expect": "True"}]},
  {"name": "Prints a 12-character password", "seed": 4, "output_regex": "^[A-Za-z0-9]{12}$", "why": "Print exactly one 12-character password."}
]
--- hints
- Start with password = "" and add random.choice(characters) to it, length times.
--- solution
```python
import random

characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

def make_password(length):
    password = ""
    for i in range(length):
        password += random.choice(characters)
    return password

print(make_password(12))
```
:::

::: exercise id=rand-coin title="Coin flip experiment"
Flip a coin 1000 times using `random.choice(["heads", "tails"])`. Count the heads and print `Heads: N` then `Tails: N`. The two numbers must add up to 1000.

```python
import random

```
--- tests
[
  {"name": "Counts add to 1000", "seed": 9, "output_regex": "Heads: (\\d+)\\nTails: (\\d+)", "why": "Print Heads: N then Tails: N on two lines."},
  {"name": "Exact counts with a fixed seed", "seed": 9, "vars": [{"name": "heads", "type": "int"}], "code_regex": [{"pattern": "range\\(\\s*1000\\s*\\)", "why": "Loop exactly 1000 times with range(1000)."}, {"pattern": "choice\\(", "why": "Use random.choice([\"heads\", \"tails\"])."}]},
  {"name": "Roughly fair", "seed": 11, "calls": [{"expr": "400 < heads < 600", "expect": "True"}]}
]
--- hints
- heads = 0 before the loop. Inside: if random.choice(["heads", "tails"]) == "heads": heads += 1
- Tails is 1000 - heads.
--- solution
```python
import random

heads = 0
for i in range(1000):
    if random.choice(["heads", "tails"]) == "heads":
        heads += 1
print(f"Heads: {heads}")
print(f"Tails: {1000 - heads}")
```
:::

## What you learned

- `import module` then `module.function()`. Or `from module import function`.
- `random.randint`, `random.choice`, `random.shuffle`, `random.sample`.
- `math.sqrt`, `math.pi`, `math.floor`, `math.ceil`.
