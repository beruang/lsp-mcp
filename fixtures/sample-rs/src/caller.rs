use crate::{FriendlyGreeter, Greeter, Calculator};

fn call_greeter() {
    let g = FriendlyGreeter;
    let _msg = g.greet("integration-test");
}

fn use_calculator() {
    let c = Calculator;
    let _result = c.add(10, 20);
}
