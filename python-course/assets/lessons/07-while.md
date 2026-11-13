---
title: Repeating with while
goal: Loop until something happens, stop loops with break, and build a complete guessing game.
---
## Looping until

A `for` loop is for when you know how many times to repeat. A `while` loop repeats **as long as a condition is true**. You use it when you do not know in advance how many times: keep asking until the answer is right, keep playing until the game ends.

```python
count = 1
while count <= 5:
    print(count)
    count += 1
print("Done")
```

Each time around, Python checks `count <= 5`. If it is true, the block runs. Once `count` becomes 6, the check fails and the loop ends.

## Infinite loops

If the condition never becomes false, the loop never ends. Run this and press **Stop** when you have seen enough:

```python
n = 0
while n < 3:
    print("forever?")
```

The bug: `n` never changes. Every `while` loop needs something inside that moves it toward stopping.

## Asking until the answer is right

```python
answer = ""
while answer != "python":
    answer = input("What is the best programming language? ").lower()
print("Correct!")
```

## break and while True

A common style is to loop forever on purpose with `while True:` and use `break` to jump out when you decide to.

```python
while True:
    word = input("Type a word (or quit): ")
    if word == "quit":
        break
    print(f"{word} has {len(word)} letters")
print("Bye!")
```

`break` immediately exits the nearest loop. Its cousin `continue` skips the rest of this round and goes back to the top:

```python
for n in range(1, 11):
    if n % 3 == 0:
        continue
    print(n)
```

## A complete guessing game

Here is everything from the course so far, in one program. Read it carefully before you run it.

```python
secret = 7
tries = 0

while True:
    guess = int(input("Guess my number (1-10): "))
    tries += 1
    if guess < secret:
        print("Higher!")
    elif guess > secret:
        print("Lower!")
    else:
        print(f"You got it in {tries} tries!")
        break
```

::: note
In lesson 12 you will make `secret` random, so the game is different every time.
:::

::: exercise id=while-countdown title="Countdown"
Use a `while` loop to print 10 down to 1, then `Liftoff!`.

```python
n = 10

```
--- tests
[
  {"name": "Counts down then lifts off", "output_equals": "10\n9\n8\n7\n6\n5\n4\n3\n2\n1\nLiftoff!"},
  {"name": "Uses a while loop", "code_regex": [{"pattern": "^\\s*while\\b", "why": "Use a while loop for this one."}]}
]
--- hints
- while n > 0: print(n) then n -= 1
- Liftoff goes after the loop, not inside it.
--- solution
```python
n = 10
while n > 0:
    print(n)
    n -= 1
print("Liftoff!")
```
:::

::: exercise id=while-password title="Keep asking"
Keep asking `Password: ` until the user types `hunter2`. Print `Wrong, try again` after each wrong attempt, and `Welcome in` once they get it right.

```python

```
--- tests
[
  {"name": "Right first time", "stdin": ["hunter2"], "output_not_contains": "Wrong", "last_line": "Welcome in"},
  {"name": "Right on the third try", "stdin": ["abc", "123", "hunter2"], "output_contains": ["Wrong, try again"], "last_line": "Welcome in"},
  {"name": "Uses a while loop", "code_regex": [{"pattern": "^\\s*while\\b", "why": "Use a while loop to keep asking."}]}
]
--- hints
- while True: ask, if correct break, else print the wrong message.
- Or: password = "" then while password != "hunter2":
--- solution
```python
while True:
    password = input("Password: ")
    if password == "hunter2":
        break
    print("Wrong, try again")
print("Welcome in")
```
:::

::: exercise id=while-adder title="Add until zero"
Keep asking for numbers with the prompt `Number: ` and add them up. When the user enters `0`, stop and print `Total: ` followed by the sum.

```python

```
--- tests
[
  {"name": "5 + 10 + 3 = 18", "stdin": ["5", "10", "3", "0"], "last_line": "Total: 18"},
  {"name": "Zero right away", "stdin": ["0"], "last_line": "Total: 0"},
  {"name": "Negative numbers work", "stdin": ["10", "-4", "0"], "last_line": "Total: 6"}
]
--- hints
- total = 0 before the loop. Inside: number = int(input("Number: ")), if number == 0: break, total += number
--- solution
```python
total = 0
while True:
    number = int(input("Number: "))
    if number == 0:
        break
    total += number
print(f"Total: {total}")
```
:::

::: exercise id=while-guess title="Guessing game with limited tries"
Finish the guessing game. The secret is 42. The player gets at most 5 guesses with the prompt `Guess: `. Print `Higher` or `Lower` after wrong guesses. If they get it, print `You win!` and stop. If they run out of guesses, print `You lose! It was 42`.

```python
secret = 42
tries = 0

```
--- tests
[
  {"name": "Wins on the second guess", "stdin": ["10", "42"], "output_contains": ["Higher"], "last_line": "You win!"},
  {"name": "Lower hint works", "stdin": ["50", "42"], "output_contains": ["Lower"], "last_line": "You win!"},
  {"name": "Loses after 5 wrong guesses", "stdin": ["1", "2", "3", "4", "5"], "last_line": "You lose! It was 42"},
  {"name": "Wins on the fifth guess", "stdin": ["1", "2", "3", "4", "42"], "last_line": "You win!"}
]
--- hints
- while tries < 5: ask, tries += 1, compare.
- After the loop, you need to know whether they won. One way: set won = True and break when they guess right, then after the loop: if not won: print the lose message.
--- solution
```python
secret = 42
tries = 0
won = False
while tries < 5:
    guess = int(input("Guess: "))
    tries += 1
    if guess < secret:
        print("Higher")
    elif guess > secret:
        print("Lower")
    else:
        won = True
        break
if won:
    print("You win!")
else:
    print(f"You lose! It was {secret}")
```
:::

## What you learned

- `while condition:` repeats until the condition is false. Make sure something inside changes it.
- `while True:` plus `break` is the normal way to write "loop until I say stop".
- `continue` skips to the next round.
