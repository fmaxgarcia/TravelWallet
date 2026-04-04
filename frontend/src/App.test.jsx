import { render, screen } from "@testing-library/react";

import App from "./App.jsx";

test("renders the app title", () => {
  render(<App />);
  expect(screen.getByText(/TravelWallet/i)).toBeInTheDocument();
});
