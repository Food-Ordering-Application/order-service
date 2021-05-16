import { MigrationInterface, QueryRunner } from 'typeorm';

export class addDefaultToSubTotalOrderItem1621147009938
  implements MigrationInterface {
  name = 'addDefaultToSubTotalOrderItem1621147009938';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD "subTotal" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery" ALTER COLUMN "shippingFee" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ALTER COLUMN "subTotal" SET DEFAULT '30000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery" ALTER COLUMN "shippingFee" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "delivery" ALTER COLUMN "shippingFee" SET DEFAULT '15000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ALTER COLUMN "subTotal" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery" ALTER COLUMN "shippingFee" SET DEFAULT '15000'`,
    );
    await queryRunner.query(`ALTER TABLE "order_item" DROP COLUMN "subTotal"`);
  }
}
