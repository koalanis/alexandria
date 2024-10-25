import { randomInt, randomRGB, rgb } from "./utils";

const COLOR_LIST = ["yellow", "blue", "red", "pink", "cyan", "green", "purple"]

function randomPick<T>(ele: T[]): T | undefined {
  const idx = Math.floor(Math.random() * ele.length);
  if (ele.length == 0) return undefined;
  return ele[idx];
}

export function main(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const $ = new Canvas(canvas, ctx);

  $.generateRandomBooks();

  function draw() {
    $.drawBackground();
    $.drawShelves();
    $.drawBooks();
    window.requestAnimationFrame(draw);
  }

  window.requestAnimationFrame(draw);
}



type Book = {
  color: number[];
}


class Canvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;

  NUM_OF_BOOKS = 20;
  NUM_OF_SHELVES = 6;
  offset: number;
  shelfWidth: number;
  gap: number;
  bookWidth: number;
  shelves: Book[][];


  constructor(canvas: HTMLCanvasElement, ctx: Canvas2D) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    this.shelfWidth = 5;
    this.offset = 20;
    this.gap = 100
    this.bookWidth = 20;
    this.shelves = new Array<Array<Book>>(this.NUM_OF_SHELVES - 1);

    console.log(this.width, this.height)
  }

  drawBackground() {
    this.ctx.fillStyle = "gray";
    this.ctx.fillRect(0, 0, 1000, 1000);
  }

  drawShelves() {
    this.ctx.fillStyle = rgb([50, 50, 50]);

    const length = 1000;
    let off = this.offset
    for (let i = 0; i < this.NUM_OF_SHELVES; i++) {
      this.ctx.fillRect(0, off, length, this.shelfWidth);
      off += (this.shelfWidth + this.gap);
    }
  }


  generateRandomBooks() {

    for (let i = 0; i < this.NUM_OF_BOOKS; i++) {
      const randomShelf = randomInt(this.NUM_OF_SHELVES - 1);
      let randColor = randomRGB();
      if (this.shelves[randomShelf] === undefined) this.shelves[randomShelf] = [];
      this.shelves[randomShelf].push({ color: randColor });
    }

    console.log(this.shelves)


  }

  drawBooks() {
    for (let i = 0; i < this.shelves.length; i++) {
      let y = (this.offset + this.shelfWidth) + (i * (this.shelfWidth + this.gap))
      for (let j = 0; j < this.shelves[i].length; j++) {
        let x = (j * this.bookWidth);

        let book = this.shelves[i][j];

        this.ctx.fillStyle = rgb(book.color);
        this.ctx.fillRect(x, y, this.bookWidth, this.gap);

        this.ctx.strokeStyle = rgb(book.color.map(ch => ch - 50));
        this.ctx.strokeRect(x, y, this.bookWidth, this.gap);
      }
    }
  }

}

