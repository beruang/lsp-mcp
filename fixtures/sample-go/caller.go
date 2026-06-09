package main

func callGreeter() {
	g := FriendlyGreeter{}
	g.Greet("integration-test")
}

func useCalculator() {
	c := Calculator{}
	result := c.Add(10, 20)
	_ = result
}
