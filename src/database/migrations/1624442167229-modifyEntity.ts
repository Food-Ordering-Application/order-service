import { MigrationInterface, QueryRunner } from 'typeorm';

export class modifyEntity1624442167229 implements MigrationInterface {
  name = 'modifyEntity1624442167229';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "delivery_location" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "cityId" character varying, "cityName" character varying, "areaId" character varying, "areaName" character varying, CONSTRAINT "REL_d912dc9c368b3c8b2b233e0b3d" UNIQUE ("orderId"), CONSTRAINT "PK_114fcecdca36fb589856f3303aa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_location" ADD CONSTRAINT "FK_d912dc9c368b3c8b2b233e0b3da" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "delivery_location" DROP CONSTRAINT "FK_d912dc9c368b3c8b2b233e0b3da"`,
    );
    await queryRunner.query(`DROP TABLE "delivery_location"`);
  }
}
