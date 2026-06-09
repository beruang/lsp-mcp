from hello import greet, add_numbers


def main() -> None:
    message = greet("world")
    total = add_numbers(1, 2)
    # type mismatch: passing str to int param
    bad = add_numbers("not_a_number", 42)
