package main

// Greeter is an interface for greeting things.
type Greeter interface {
	Greet(name string) string
}

// FriendlyGreeter implements Greeter.
type FriendlyGreeter struct{}

func (f FriendlyGreeter) Greet(name string) string {
	return "Hello, " + name + "!"
}

// FormalGreeter also implements Greeter.
type FormalGreeter struct{}

func (f FormalGreeter) Greet(name string) string {
	return "Good day, " + name + "."
}

// Calculator is a struct with methods for math ops.
type Calculator struct{}

// Add adds two integers.
func (c Calculator) Add(a, b int) int {
	return a + b
}

// Multiply multiplies two integers.
func (c Calculator) Multiply(a, b int) int {
	return a * b
}

func main() {
	f := FriendlyGreeter{}
	f.Greet("world")
	c := Calculator{}
	c.Add(1, 2)
	c.Multiply(3, 4)
}
