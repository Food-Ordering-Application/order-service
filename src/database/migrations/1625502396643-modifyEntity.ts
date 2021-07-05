import { MigrationInterface, QueryRunner } from 'typeorm';

export class modifyEntity1625502396643 implements MigrationInterface {
  name = 'modifyEntity1625502396643';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "zalo_pay_payment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "zalopayTransactionId" character varying NOT NULL, "zalopayRefundId" character varying NOT NULL, "merchantUserId" character varying NOT NULL, "channel" integer NOT NULL, "serverTime" bigint NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "paymentId" uuid, CONSTRAINT "REL_6c41c90aa906df9bb726b85f4d" UNIQUE ("paymentId"), CONSTRAINT "PK_beff7634297d4d5236dd6ebf35e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "zalo_pay_payment" ADD CONSTRAINT "FK_6c41c90aa906df9bb726b85f4d8" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "zalo_pay_payment" DROP CONSTRAINT "FK_6c41c90aa906df9bb726b85f4d8"`,
    );
    await queryRunner.query(`DROP TABLE "zalo_pay_payment"`);
  }
}
