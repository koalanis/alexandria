import { getLibrary, addBook, type BookEntry } from './library';

const SEED_BOOKS: BookEntry[] = [
  { id: 's1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780743273565-M.jpg', year: 1925, addedAt: 0 },
  { id: 's2', title: 'To Kill a Mockingbird', authors: ['Harper Lee'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780061935466-M.jpg', year: 1960, addedAt: 0 },
  { id: 's3', title: '1984', authors: ['George Orwell'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780451524935-M.jpg', year: 1949, addedAt: 0 },
  { id: 's4', title: 'Dune', authors: ['Frank Herbert'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780441013593-M.jpg', year: 1965, addedAt: 0 },
  { id: 's5', title: 'The Hitchhiker\'s Guide to the Galaxy', authors: ['Douglas Adams'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780345391803-M.jpg', year: 1979, addedAt: 0 },
  { id: 's6', title: 'Neuromancer', authors: ['William Gibson'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780441569595-M.jpg', year: 1984, addedAt: 0 },
  { id: 's7', title: 'Brave New World', authors: ['Aldous Huxley'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780060850524-M.jpg', year: 1932, addedAt: 0 },
  { id: 's8', title: 'Fahrenheit 451', authors: ['Ray Bradbury'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9781451673319-M.jpg', year: 1953, addedAt: 0 },
  { id: 's9', title: 'The Catcher in the Rye', authors: ['J.D. Salinger'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780316769174-M.jpg', year: 1951, addedAt: 0 },
  { id: 's10', title: 'One Hundred Years of Solitude', authors: ['Gabriel García Márquez'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780060883287-M.jpg', year: 1967, addedAt: 0 },
  { id: 's11', title: 'The Road', authors: ['Cormac McCarthy'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780307387899-M.jpg', year: 2006, addedAt: 0 },
  { id: 's12', title: 'Blood Meridian', authors: ['Cormac McCarthy'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780679728757-M.jpg', year: 1985, addedAt: 0 },
  { id: 's13', title: 'Slaughterhouse-Five', authors: ['Kurt Vonnegut'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780440180296-M.jpg', year: 1969, addedAt: 0 },
  { id: 's14', title: 'The Master and Margarita', authors: ['Mikhail Bulgakov'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780140455465-M.jpg', year: 1967, addedAt: 0 },
  { id: 's15', title: 'Infinite Jest', authors: ['David Foster Wallace'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780316066525-M.jpg', year: 1996, addedAt: 0 },
  { id: 's16', title: 'Crime and Punishment', authors: ['Fyodor Dostoevsky'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780143107637-M.jpg', year: 1866, addedAt: 0 },
  { id: 's17', title: 'The Brothers Karamazov', authors: ['Fyodor Dostoevsky'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780374528379-M.jpg', year: 1880, addedAt: 0 },
  { id: 's18', title: 'Anna Karenina', authors: ['Leo Tolstoy'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780143035008-M.jpg', year: 1878, addedAt: 0 },
  { id: 's19', title: 'Moby Dick', authors: ['Herman Melville'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9781503280786-M.jpg', year: 1851, addedAt: 0 },
  { id: 's20', title: 'Ulysses', authors: ['James Joyce'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780394743127-M.jpg', year: 1922, addedAt: 0 },
];

export function seedIfEmpty(): void {
  if (getLibrary().books.length > 0) return;
  SEED_BOOKS.forEach(addBook);
}
