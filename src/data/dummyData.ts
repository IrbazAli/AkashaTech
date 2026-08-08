export interface DummyPerson {
  nicheNum: string;
  status: 'occupied' | 'reserved' | 'available';
  name: string;
  dob: string;
  dod: string;
  message: string;
}

export const DUMMY_PEOPLE: DummyPerson[] = [
  { nicheNum: 'Niche-1', status: 'occupied', name: 'Person 1', dob: '1941-01-01', dod: '2011-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-2', status: 'occupied', name: 'Person 2', dob: '1942-01-01', dod: '2012-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-3', status: 'occupied', name: 'Person 3', dob: '1943-01-01', dod: '2013-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-4', status: 'occupied', name: 'Person 4', dob: '1944-01-01', dod: '2014-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-5', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-6', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-7', status: 'occupied', name: 'Person 7', dob: '1947-01-01', dod: '2017-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-8', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-9', status: 'occupied', name: 'Person 9', dob: '1949-01-01', dod: '2019-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-10', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-11', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-12', status: 'occupied', name: 'Person 12', dob: '1952-01-01', dod: '2022-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-13', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-14', status: 'occupied', name: 'Person 14', dob: '1954-01-01', dod: '2024-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-15', status: 'occupied', name: 'Person 15', dob: '1955-01-01', dod: '2010-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-16', status: 'occupied', name: 'Person 16', dob: '1956-01-01', dod: '2011-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-17', status: 'occupied', name: 'Person 17', dob: '1957-01-01', dod: '2012-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-18', status: 'occupied', name: 'Person 18', dob: '1958-01-01', dod: '2013-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-19', status: 'occupied', name: 'Person 19', dob: '1959-01-01', dod: '2014-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-20', status: 'occupied', name: 'Person 20', dob: '1960-01-01', dod: '2015-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-21', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-22', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-23', status: 'occupied', name: 'Person 23', dob: '1963-01-01', dod: '2018-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-24', status: 'occupied', name: 'Person 24', dob: '1964-01-01', dod: '2019-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-25', status: 'occupied', name: 'Person 25', dob: '1965-01-01', dod: '2020-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-26', status: 'occupied', name: 'Person 26', dob: '1966-01-01', dod: '2021-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-27', status: 'occupied', name: 'Person 27', dob: '1967-01-01', dod: '2022-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-28', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-29', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-30', status: 'occupied', name: 'Person 30', dob: '1970-01-01', dod: '2010-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-31', status: 'occupied', name: 'Person 31', dob: '1971-01-01', dod: '2011-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-32', status: 'occupied', name: 'Person 32', dob: '1972-01-01', dod: '2012-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-33', status: 'occupied', name: 'Person 33', dob: '1973-01-01', dod: '2013-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-34', status: 'occupied', name: 'Person 34', dob: '1974-01-01', dod: '2014-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-35', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-36', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-37', status: 'occupied', name: 'Person 37', dob: '1977-01-01', dod: '2017-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-38', status: 'occupied', name: 'Person 38', dob: '1978-01-01', dod: '2018-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-39', status: 'occupied', name: 'Person 39', dob: '1979-01-01', dod: '2019-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-40', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-41', status: 'occupied', name: 'Person 41', dob: '1981-01-01', dod: '2021-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-42', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-43', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-44', status: 'occupied', name: 'Person 44', dob: '1984-01-01', dod: '2024-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-45', status: 'occupied', name: 'Person 45', dob: '1985-01-01', dod: '2010-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-46', status: 'occupied', name: 'Person 46', dob: '1986-01-01', dod: '2011-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-47', status: 'occupied', name: 'Person 47', dob: '1987-01-01', dod: '2012-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-48', status: 'occupied', name: 'Person 48', dob: '1988-01-01', dod: '2013-12-31', message: 'Rest in peace.' },
  { nicheNum: 'Niche-49', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
  { nicheNum: 'Niche-50', status: 'reserved', name: 'Reserved', dob: '', dod: '', message: 'This niche is reserved.' },
];


export const DUMMY_SHAPE_SLOTS: Record<string, DummyPerson[]> = {};
const shapes = ['diamond', 'heart', 'star', 'square', 'spiral'];
shapes.forEach(shape => {
  const slots: DummyPerson[] = [];
  for (let i = 1; i <= 10; i++) {
    slots.push({
      nicheNum: shape.charAt(0).toUpperCase() + shape.slice(1) + ' Slot ' + i,
      status: i <= 2 ? 'occupied' : 'available',
      name: i <= 2 ? shape.charAt(0).toUpperCase() + shape.slice(1) + ' Family Member ' + i : 'Available',
      dob: i <= 2 ? '1950-01-01' : '',
      dod: i <= 2 ? '2020-01-01' : '',
      message: i <= 2 ? 'Forever shining' : 'This ' + shape + ' slot is available for purchase.'
    });
  }
  DUMMY_SHAPE_SLOTS[shape] = slots;
});
