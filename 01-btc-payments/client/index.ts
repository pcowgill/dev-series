// Client side functionality

import { Projector, VNode, createProjector, h } from "maquette";
import { Product, Message, Selection, Size, Order } from "../lib";
import { EventT, Page, State } from "./Model";

/* INIT */

const state: State = {
  cart: new Map(),
  page: "welcome",
  products: new Map(),
  selections: new Map()
};

/* WEBSOCKET */

const ws: WebSocket = new WebSocket("ws://localhost:8081");
const projector: Projector = createProjector();

ws.addEventListener("message", (e: MessageEvent) => {
  const msg = JSON.parse(e.data) as Message;
  switch (msg.__ctor) {
    case "Products": {
      event({
        __ctor: "Load",
        products: new Map(msg.data.map(p => [p.id, p] as [string, Product]))
      });
      break;
    }
    case "Confirmation": {
      event({
        __ctor: "Goto",
        page: "confirmation"
      });
    }
  }
  projector.scheduleRender();
});

/* STEPPER */

function step(ev: EventT, s0: State): void {
  switch (ev.__ctor) {
    case "Goto": {
      console.log("GOTO", ev.page);
      s0.page = ev.page;
      return;
    }
    case "Load": {
      console.log("LOAD");
      s0.products = ev.products;
      s0.page = "store";
      return;
    }
    case "CartAdd": {
      console.log("CARTADD");
      const sel = s0.selections.get(ev.product) as Selection;
      const cartKey = ev.product + ":" + sel.size;
      if (s0.cart.has(cartKey)) {
        (s0.cart.get(cartKey) as Selection).quantity += sel.quantity;
      } else {
        s0.cart.set(cartKey, { ...sel });
      }
      s0.selections.delete(ev.product);
      return;
    }
    case "QuantityClick": {
      console.log("QUANTITYCLICK");
      if (s0.selections.has(ev.product)) {
        const sel = s0.selections.get(ev.product) as Selection;
        switch (ev.action) {
          case "up": {
            sel.quantity += 1;
            break;
          }
          case "down": {
            sel.quantity = Math.max(0, sel.quantity - 1);
          }
        }
      }
      return;
    }
    case "SizeClick": {
      console.log("SIZECLICK");
      if (!s0.selections.has(ev.product)) {
        s0.selections.set(ev.product, {
          product: s0.products.get(ev.product) as Product,
          quantity: 1,
          size: ev.size
        });
      } else {
        (s0.selections.get(ev.product) as Selection).size = ev.size;
      }
      return;
    }
    case "SubmitOrder": {
      console.log("SUBMITORDER");
      const ss = [] as Selection[];
      s0.cart.forEach(s => ss.push(s));
      const order = {
        __ctor: "Order",
        data: ss
      } as Order;
      ws.send(JSON.stringify(order));
      return;
    }
    case "ConfirmOk": {
      console.log("CONFIRMOK");
      s0.page = "store";
      s0.cart = new Map();
      s0.selections = new Map();
      return;
    }
  }
}

function event(ev: EventT): void {
  step(ev, state);
  projector.scheduleRender();
}

/* VIEWS */

function render(): VNode {
  switch (state.page) {
    case "welcome": {
      return welcome();
    }
    case "store": {
      return store();
    }
    case "cart": {
      return cart();
    }
    case "payment": {
      return payment();
    }
    case "confirmation": {
      return confirmation();
    }
  }
}

// Welcome!
function welcome(): VNode {
  return h("div.container", [
    "Welcome to the Bitcoin & Open Blockchain meetup store!"
  ]);
}

// T-shirt store
function store(): VNode {
  const ps = [] as VNode[];
  state.products.forEach(p => {
    ps.push(renderProduct(p));
  });
  let cartSize = 0;
  state.cart.forEach(s => (cartSize += s.quantity));
  return h("div.container", [
    h("div.row", { key: 1 }, [h("h1", ["Bitcoin & Open Blockchain Store"])]),
    h("div.row.nav", { key: 2 }, [
      h("div.col", { key: 1, onclick: gotoPage("cart") }, [
        `View cart (${cartSize})`
      ])
    ]),
    h("div.row", { key: 3 }, ps)
  ]);
}

function renderProduct(p: Product): VNode {
  const f = (ev: MouseEvent) => {
    event({
      __ctor: "CartAdd",
      product: p.id
    });
  };
  const children = [
    h("div.row", { key: "caption" }, [p.caption]), // caption
    h("div.row", { key: "image" }, [h("img", { src: `${p.id}.svg` })]), // image
    h("div.row", { key: "price" }, ["$" + dollars(p.price).toString()]), // price
    sizes(p.id), // sizes
    quantity(p.id) // quantity
  ];
  if (selectionComplete(p.id)) {
    children.push(h("div.row", { key: "add", onclick: f }, ["Add to cart"]));
  }
  return h("div.product", { key: p.id }, [h("div.container", children)]);
}

// Simple size selector
function sizes(pid: string): VNode {
  function f(s: Size): (e: MouseEvent) => void {
    return e => {
      event({
        __ctor: "SizeClick",
        product: pid,
        size: s
      });
    };
  }
  return h(
    "div.row",
    { key: "sizes" },
    (["S", "M", "L"] as Size[]).map(s => {
      const isSelected =
        state.selections.has(pid) &&
        (state.selections.get(pid) as Selection).size === s;
      return h(
        "div.col-sm",
        { key: s, onclick: f(s), classes: { selected: isSelected } },
        [s]
      );
    })
  );
}

// Simple quantity updater: "(-) q (+)"
function quantity(pid: string): VNode {
  const up = (ev: MouseEvent) => {
    event({
      __ctor: "QuantityClick",
      product: pid,
      action: "up"
    });
  };
  const down = (ev: MouseEvent) => {
    event({
      __ctor: "QuantityClick",
      product: pid,
      action: "down"
    });
  };
  const q = state.selections.has(pid)
    ? (state.selections.get(pid) as Selection).quantity
    : 0;
  return h("div.row", { key: "quantity" }, [
    h("div.col-sm", { key: 1, onclick: down }, ["(-)"]),
    h("div.col-sm", { key: 2 }, [q.toString()]),
    h("div.col-sm", { key: 3, onclick: up }, ["(+)"])
  ]);
}

// Shopping cart
function cart(): VNode {
  let total = 0;
  const rows = [] as VNode[];
  state.cart.forEach(s => {
    total += s.quantity * s.product.price;
    rows.push(
      h("div.row", { key: s.product.id }, [
        cols([
          s.product.caption,
          s.size as string,
          s.quantity.toString(),
          dollars(s.quantity * s.product.price).toString()
        ])
      ])
    );
  });
  const items = [
    h("div.row", { key: 1 }, [h("h1", ["Shopping cart"])]),
    h("div.row", { key: 2 }, cols(["Desc", "Size", "Quantity", "Price"])),
    rows.length > 0 ? rows : "No items",
    h("div.row", { key: 3 }, ["Total: $" + dollars(total).toString()]),
    h("div.row", { key: 4, onclick: gotoPage("store") }, ["Continue shopping"])
  ];
  if (state.cart.size > 0) {
    items.push(
      h("div.row", { key: 5, onclick: gotoPage("payment") }, ["Checkout"])
    );
  }
  return h("div.container", items);
}

// Payment page
function payment(): VNode {
  const f = (ev: MouseEvent) => {
    event({
      __ctor: "SubmitOrder"
    });
  };
  return h("div.container", [
    h("div.row", { key: 1 }, ["Pay with a credit card..."]),
    h("div.row", { key: 2 }, [h("div.button", { onclick: f }, ["GO!"])])
  ]);
}

// Confirmation
function confirmation(): VNode {
  const f = (ev: MouseEvent) => {
    event({
      __ctor: "ConfirmOk"
    });
  };
  const rows = [] as VNode[];
  state.cart.forEach(s =>
    rows.push(
      h(
        "div.row",
        { key: s.product.id },
        cols([s.product.caption, s.size as string, s.quantity.toString()])
      )
    )
  );
  return h("div.container", [
    h("div.row", { key: 1 }, ["Success!"]),
    rows,
    h("div.row", { key: 2 }, [h("div.button", { onclick: f }, ["OK"])])
  ]);
}

/* HELPERS */

function cols(xs: string[]): VNode[] {
  return xs.map(x => h("div.col-sm", { key: x.toString() }, [x]));
}

function dollars(cs: number): number {
  return cs / 100;
}
function gotoPage(p: Page): (ev: MouseEvent) => void {
  const f = (ev: MouseEvent) => {
    event({
      __ctor: "Goto",
      page: p
    });
  };
  return f;
}

function selectionComplete(pid: string): boolean {
  if (state.selections.has(pid)) {
    const sel = state.selections.get(pid) as Selection;
    return sel.size !== null && sel.quantity > 0;
  }
  return false;
}

// GO!
projector.append(document.body, render);
