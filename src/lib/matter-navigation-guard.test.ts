import { expect, it, vi } from "vitest";
import { allowMatterNavigation, setMatterNavigationGuard } from "./matter-navigation-guard";

it("keeps an unsaved matter open when leaving is refused and allows leaving once confirmed", () => {
  const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  const stop = setMatterNavigationGuard(confirm);
  expect(allowMatterNavigation()).toBe(false);
  expect(allowMatterNavigation()).toBe(true);
  stop();
  expect(allowMatterNavigation()).toBe(true);
  expect(confirm).toHaveBeenCalledTimes(2);
});

it("does not clear a newer guard when an older form unmounts", () => {
  const stopFirst = setMatterNavigationGuard(() => true);
  const stopSecond = setMatterNavigationGuard(() => false);
  stopFirst();
  expect(allowMatterNavigation()).toBe(false);
  stopSecond();
});
