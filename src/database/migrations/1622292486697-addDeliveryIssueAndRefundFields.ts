import {MigrationInterface, QueryRunner} from "typeorm";

export class addDeliveryIssueAndRefundFields1622292486697 implements MigrationInterface {
    name = 'addDeliveryIssueAndRefundFields1622292486697'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "delivery" ADD "issueNote" character varying`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD "issueType" character varying`);
        await queryRunner.query(`ALTER TABLE "paypal_payment" ADD "refundId" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "paypal_payment" DROP COLUMN "refundId"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "issueType"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "issueNote"`);
    }

}
