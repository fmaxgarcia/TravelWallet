import { render, screen } from "@testing-library/react";

import App from "./App.jsx";

test("renders the login prompt", () => {
  render(<App />);
  expect(screen.getByText(/TravelWallet/i)).toBeInTheDocument();
  expect(screen.getByText(/Sign in/i)).toBeInTheDocument();
});
