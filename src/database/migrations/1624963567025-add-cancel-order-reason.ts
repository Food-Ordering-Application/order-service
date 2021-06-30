import { MigrationInterface, QueryRunner } from 'typeorm';

export class addCancelOrderReason1624963567025 implements MigrationInterface {
  name = 'addCancelOrderReason1624963567025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cancel_order_reason" ("id" SERIAL NOT NULL, "sourceType" integer NOT NULL, "targetType" integer NOT NULL, "content" character varying NOT NULL, "displayOrder" integer NOT NULL DEFAULT '-1', CONSTRAINT "PK_3c8051da594cc000738e49b458b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3861f4cb9f9842958e57ebc5ce" ON "cancel_order_reason" ("displayOrder") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3a910b16b5a0fa427b01db23cc" ON "cancel_order_reason" ("sourceType", "id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery" ADD "cancelOrderReasonId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery" ADD "cancelNote" character varying`,
    );

    await queryRunner.query(
      `ALTER TABLE "delivery" ADD CONSTRAINT "FK_9e3d8fd5327001d9160c2fed278" FOREIGN KEY ("cancelOrderReasonId") REFERENCES "cancel_order_reason"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "delivery" DROP CONSTRAINT "FK_9e3d8fd5327001d9160c2fed278"`,
    );
    await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "cancelNote"`);
    await queryRunner.query(
      `ALTER TABLE "delivery" DROP COLUMN "cancelOrderReasonId"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_3a910b16b5a0fa427b01db23cc"`);
    await queryRunner.query(`DROP INDEX "IDX_3861f4cb9f9842958e57ebc5ce"`);
    await queryRunner.query(`DROP TABLE "cancel_order_reason"`);
  }
}
