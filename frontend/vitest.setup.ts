import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
};

HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
};
