insert into public.categories (name, slug, description, image_url, is_active)
values
  ('Piel', 'piel', 'Productos para limpieza, hidratacion y tratamiento de la piel.', 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=80', true),
  ('Cabello', 'cabello', 'Tratamientos para brillo, fuerza, cuero cabelludo y puntas.', 'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?auto=format&fit=crop&w=900&q=80', true),
  ('Kit', 'kit', 'Rutinas completas y combinaciones listas para usar.', 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=80', true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  image_url = excluded.image_url,
  is_active = excluded.is_active;

insert into public.products (name, category, description, price, stock, image_url, is_active)
values
  (
    'Serum Barrera Ceramide 5%',
    'Piel',
    'Repara la barrera cutanea con ceramidas, niacinamida y pantenol.',
    42.00,
    24,
    'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=80',
    true
  ),
  (
    'Limpieza Amino Gel',
    'Piel',
    'Gel suave para limpieza diaria sin resecar.',
    26.00,
    38,
    'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=900&q=80',
    true
  ),
  (
    'Aceite Capilar Biomimetic',
    'Cabello',
    'Tratamiento para brillo, puntas secas y control de frizz.',
    36.00,
    18,
    'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?auto=format&fit=crop&w=900&q=80',
    true
  ),
  (
    'Mascarilla Scalp Reset',
    'Cabello',
    'Mascarilla de cuero cabelludo con arcillas suaves y prebioticos.',
    31.00,
    21,
    'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80',
    true
  ),
  (
    'Kit Rutina Glow',
    'Kit',
    'Rutina completa con limpieza, serum y crema hidratante.',
    89.00,
    12,
    'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=80',
    true
  );
