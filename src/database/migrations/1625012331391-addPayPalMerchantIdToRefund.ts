import { MigrationInterface, QueryRunner } from 'typeorm';

export class addPayPalMerchantIdToRefund1625012331391
  implements MigrationInterface
{
  name = 'addPayPalMerchantIdToRefund1625012331391';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "paypal_payment" ADD "paypalMerchantId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "paypal_payment" DROP COLUMN "paypalMerchantId"`,
    );
  }
}
