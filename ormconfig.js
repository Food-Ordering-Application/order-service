module.exports = {
  type: 'postgres',
  host: 'postgis',
  port: '5432',
  username: 'admin',
  password: 'admin',
  database: 'orderservice',
  entities: [__dirname + '/**/*.entity.{js,ts}'],
  migrations: [__dirname + '/**/*.migration.{js,ts}'],
  synchronize: true,
  seeds: [__dirname + '/**/seeders/**/*.seed{.ts,.js}'],
  factories: [__dirname + '/**/factories/**/*.factory{.ts,.js}'],
};
