/// A trait for things that can be greeted.
trait Greeter {
    fn greet(&self, name: &str) -> String;
}

/// A friendly implementation of Greeter.
struct FriendlyGreeter;

impl Greeter for FriendlyGreeter {
    fn greet(&self, name: &str) -> String {
        format!("Hello, {}!", name)
    }
}

/// A formal implementation of Greeter.
struct FormalGreeter;

impl Greeter for FormalGreeter {
    fn greet(&self, name: &str) -> String {
        format!("Good day, {}.", name)
    }
}

/// A calculator with basic operations.
struct Calculator;

impl Calculator {
    fn add(&self, a: i32, b: i32) -> i32 {
        a + b
    }

    fn multiply(&self, a: i32, b: i32) -> i32 {
        a * b
    }
}

fn main() {
    let f = FriendlyGreeter;
    f.greet("world");

    let c = Calculator;
    c.add(1, 2);
    c.multiply(3, 4);
}
