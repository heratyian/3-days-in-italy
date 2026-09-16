# AGENTS.md

## Engineering Philosophy

Optimize for **human readability, simplicity, and maintainability**.

The best code is often the code that does not need to exist.

Before adding code, ask:

* Can this be solved more directly?
* Can existing code be simplified instead?
* Is this abstraction necessary today?
* Will another engineer understand this immediately?

Prefer deleting complexity over explaining it.

## Simple, Simple, Simple

Choose the simplest implementation that clearly solves the current problem.

Prefer:

* less code over more code;
* boring code over clever code;
* explicit behavior over magic;
* conventional patterns over custom abstractions;
* direct solutions over generalized frameworks;
* a small amount of duplication over the wrong abstraction.

Do not optimize for hypothetical future requirements.

Do not confuse fewer lines with simpler code. Readability always wins over clever compression.

## Convention Over Configuration

Follow established Python and framework conventions unless there is a concrete reason not to.

Prefer the path another experienced developer would expect.

Avoid introducing unnecessary:

* configuration;
* factories;
* registries;
* adapters;
* wrappers;
* base classes;
* extension points;
* dependency injection machinery.

If the framework already has a conventional way to solve the problem, use it.

## Optimize for the Reader

Code is read more often than it is written.

Use descriptive, domain-specific names even when they are longer.

Prefer:

```python
calculate_distance_between_places()
validate_itinerary_opening_hours()
traveler_preferences
candidate_places
```

over:

```python
calc_dist()
validate()
prefs
candidates
```

A reader should be able to understand intent without mentally executing the implementation.

Avoid abbreviations unless they are universally understood in the domain.

## Prefer Functions

Use the smallest construct that solves the problem.

* If a function is sufficient, use a function.
* If a module is sufficient, do not create a class.
* If a straightforward conditional is sufficient, do not introduce a pattern.
* If existing framework functionality is sufficient, do not wrap it.

Classes should represent meaningful stateful concepts or provide clear value, not merely organize functions.

## Avoid Premature Abstraction

Do not extract an abstraction simply because two pieces of code look similar.

Duplication is sometimes cheaper than coupling unrelated concepts through the wrong abstraction.

Extract shared behavior when the shared concept is clear and the result becomes easier to understand.

Build abstractions from demonstrated requirements, not imagined ones.

## Keep Layers to a Minimum

Every layer and indirection should justify its existence.

Avoid chains such as:

```text
Controller
  → Manager
    → Service
      → Provider
        → Adapter
          → Client
```

when a direct function call communicates the same intent.

The reader should be able to trace important behavior through the codebase quickly.

## Dependencies Are a Cost

Prefer the standard library and existing project dependencies when they solve the problem cleanly.

Before adding a dependency, consider whether the functionality is simple enough to implement directly.

Do not introduce infrastructure or libraries merely because they are common in larger systems.

## Types and Data

Use type hints for public interfaces and anywhere they improve understanding.

Use structured models when they represent meaningful domain data.

Do not create models merely to move a few values between two nearby functions.

Represent missing or uncertain data honestly. Do not silently invent defaults that change meaning.

## Error Handling

Handle errors where the application can do something useful about them.

Prefer clear failures over silently swallowing unexpected conditions.

Do not add defensive code for impossible states unless there is evidence those states can occur.

Error messages should explain what failed and include enough context to diagnose the problem.

## Comments and Documentation

Prefer self-explanatory code over comments.

Comments should explain **why**, constraints, or non-obvious decisions—not narrate what the code already says.

Prefer:

```python
# Straight-line distance is sufficient here; routing is outside MVP scope.
distance = haversine(origin, destination)
```

over:

```python
# Calculate the distance.
distance = haversine(origin, destination)
```

Delete stale comments.

## Testing

Test behavior, not implementation details.

Prioritize tests around:

* domain logic;
* edge cases;
* data transformations;
* important failure modes;
* regressions.

Avoid tests whose primary effect is making refactoring harder.

When fixing a bug, add a regression test when practical.

Keep tests readable. A test should make the expected behavior obvious without requiring significant setup.

## Refactoring

Refactor toward fewer concepts, not merely different concepts.

Good refactoring may mean:

* deleting code;
* combining unnecessary layers;
* replacing an abstraction with a function;
* improving names;
* making control flow explicit;
* removing configuration;
* removing a dependency.

Do not refactor working code solely to introduce a preferred design pattern.

## Before Finishing a Change

Review the diff and ask:

1. Is there code I can delete?
2. Is there an abstraction I do not actually need?
3. Are the names clear without additional explanation?
4. Is the control flow easy to follow?
5. Did I introduce configuration where convention would work?
6. Did I add a dependency unnecessarily?
7. Are tests focused on behavior?
8. Would a new engineer understand this code quickly?

When two solutions are equally correct, prefer the one with fewer concepts, fewer layers, fewer dependencies, and less code.
