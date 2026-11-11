const DAY = 864e5
const off = (n) => new Date(Date.now() + n * DAY)

export const ANC = [12, 20, 26, 30, 34, 36, 38, 40]

export const VACCINES = [
  { name: 'BCG + Polio 0', wk: 0 },
  { name: 'Penta, PCV, Polio, Rota (dose 1)', wk: 6 },
  { name: 'Penta, PCV, Polio, Rota (dose 2)', wk: 10 },
  { name: 'Penta, PCV, Polio, Rota, IPV (dose 3)', wk: 14 },
  { name: 'Measles-Rubella 1 (9 months)', wk: 39 },
  { name: 'Measles-Rubella 2 (18 months)', wk: 78 },
]

export const mothers = [
  { id: 1, name: 'Amina Wanjiru', phone: '0712 345 678', area: 'Kasarani', edd: off(70), visits: 4, chv: 'Grace N.' },
  { id: 2, name: 'Faith Achieng', phone: '0723 456 789', area: 'Kibera', edd: off(50), visits: 3, chv: 'Peter O.', danger: 'Reduced baby movement' },
  { id: 3, name: 'Mercy Kiptoo', phone: '0734 567 890', area: 'Ruiru', edd: off(120), visits: 1, chv: 'Grace N.' },
  { id: 4, name: 'Lucy Mwikali', phone: '0745 678 901', area: 'Kasarani', edd: off(25), visits: 6, chv: 'Sarah K.' },
  { id: 5, name: 'Zawadi Hassan', phone: '0756 789 012', area: 'Mathare', edd: off(200), visits: 0, chv: 'Peter O.' },
  { id: 6, name: 'Esther Naliaka', phone: '0767 890 123', area: 'Ruiru', edd: off(85), visits: 2, chv: 'Sarah K.' },
]

export const children = [
  { id: 1, name: 'Baby of Wanjiku M.', dob: off(-50), given: ['BCG + Polio 0', 'Penta, PCV, Polio, Rota (dose 1)'], chv: 'Grace N.' },
  { id: 2, name: 'Baby of Akinyi O.', dob: off(-120), given: ['BCG + Polio 0', 'Penta, PCV, Polio, Rota (dose 1)'], chv: 'Peter O.' },
  { id: 3, name: 'Baby of Mwende K.', dob: off(-300), given: VACCINES.slice(0, 4).map((v) => v.name), chv: 'Sarah K.' },
  { id: 4, name: 'Baby of Njeri T.', dob: off(-20), given: ['BCG + Polio 0'], chv: 'Grace N.' },
]
