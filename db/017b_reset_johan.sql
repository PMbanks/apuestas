-- PM, 30-10: "no solo mi tirada, también la de Johan: reseteala". Se deshace su premio (+100) y puede volver a girar.
delete from ledger where player = (select id from players where username = 'johan') and note = 'Ruleta de la semana'
  and week = madrid_week() and kind in ('ruleta', 'ruleta_semana');
delete from wheel_spins where week = madrid_week() and player = (select id from players where username = 'johan');
select bump();
